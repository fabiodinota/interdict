//! CONNECT tunnel handler with TLS interception.
//!
//! Handles HTTP CONNECT requests by establishing a TLS-intercepted tunnel:
//! 1. Return 200 to complete CONNECT handshake
//! 2. Upgrade connection to get raw TCP stream
//! 3. Terminate TLS from client (client thinks it's talking to vendor)
//! 4. Establish TLS connection to upstream vendor
//! 5. Relay bytes bidirectionally (zero-copy)
//!
//! The allowlist check is handled by AllowlistLayer middleware before
//! this handler is called.
//!
//! KERN-13: Uses tokio::sync::watch for shutdown (bounded). No unbounded channels.

use crate::config::Config;
use crate::error::{ProxyBody, ProxyError};
use crate::evidence::{DeliveryHealth, EvidenceBuffer};
use crate::evidence::bundle::RawEvidenceEvent;
use crate::evidence::identity::ActorIdentity;
use crate::policy::content_inspection::ContentInspector;
use crate::policy::hot_reload::PolicySetManager;
use crate::policy::session::{self, ExchangeRecord, SessionStore};
use crate::policy::verdict::VerdictAction;
use crate::policy::{Direction, PolicyPipeline, RequestContext};
use crate::proxy::pool::ConnectionPool;
use crate::proxy::relay;
use crate::proxy::tls::CertCache;

use bytes::Bytes;
use http::{Method, Request, Response, StatusCode};
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use sha2::{Digest, Sha256};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::net::TcpStream;
use tower::Service;

/// Create an empty boxed body for 200 OK responses.
fn empty_body() -> ProxyBody {
    BoxBody::new(Empty::<Bytes>::new().map_err(|never| match never {}))
}

/// Create a full boxed body from bytes.
fn full_body(data: Vec<u8>) -> ProxyBody {
    BoxBody::new(Full::new(Bytes::from(data)).map_err(|never| match never {}))
}

/// Handle an HTTP CONNECT request with TLS interception.
///
/// Steps:
/// 1. Extract host:port from the CONNECT URI authority
/// 2. Return HTTP 200 to complete the CONNECT handshake
/// 3. Spawn a task to perform the actual tunnel:
///    a. Upgrade the connection to get the raw TCP stream
///    b. Terminate TLS from the client using the cert cache
///    c. Connect to the upstream vendor via the connection pool
///    d. Relay bytes bidirectionally
#[allow(clippy::too_many_arguments)]
pub async fn handle_connect(
    req: Request<Incoming>,
    cert_cache: Arc<CertCache>,
    pool: Arc<ConnectionPool>,
    config: Arc<Config>,
    pipeline: Option<Arc<PolicyPipeline>>,
    content_inspector: Option<Arc<ContentInspector>>,
    evidence_buffer: Arc<EvidenceBuffer>,
    full_text_storage: bool,
    session_store: Option<Arc<SessionStore>>,
    session_id: Option<String>,
    actor_identity: ActorIdentity,
) -> Result<Response<ProxyBody>, ProxyError> {
    // 1. Extract host and port from CONNECT authority
    let authority = req.uri().authority().ok_or(ProxyError::MissingAuthority)?;

    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(443);

    tracing::info!(
        vendor = %host,
        port = port,
        "CONNECT tunnel requested"
    );

    // 1b. Policy pipeline evaluation (Phase 2 integration)
    // Evaluate policies based on CONNECT metadata before establishing tunnel.
    //
    // Note: ContentInspector is now wired in the tunnel relay (step 3d below).
    // Phase 3 inspects outbound data at the byte-chunk level.
    // Full HTTP body parsing for structured JSON inspection is a Phase 6 concern.
    if let Some(ref pipeline) = pipeline {
        let enforcement_start = std::time::Instant::now();
        let ctx = RequestContext {
            request_id: uuid::Uuid::new_v4(),
            vendor: host.clone(),
            method: "CONNECT".to_string(),
            path: format!("{}:{}", host, port),
            content_type: None,
            content: None,
            direction: Direction::Outbound,
        };

        match pipeline.evaluate(&ctx).await {
            Ok(result) => {
                let evidence_event = build_evidence_event(
                    &host,
                    full_text_storage,
                    &ctx,
                    &result,
                    enforcement_start.elapsed(),
                    &actor_identity,
                );
                evidence_buffer.try_send(evidence_event);

                // Session context tracking (Phase 6): record exchange
                if let (Some(store), Some(sid)) = (&session_store, &session_id) {
                    // Ensure session exists
                    store.get_or_create(sid, &actor_identity.actor_id, &host);

                    let exchange = ExchangeRecord {
                        request_hash: sha256_hex(ctx.content.as_deref().unwrap_or("")),
                        response_hash: String::new(),
                        timestamp: chrono::Utc::now(),
                        verdict: result.merged_verdict.final_action,
                        categories_detected: vec![], // Categories from content inspection
                    };

                    if let Some(should_escalate) = store.record_exchange(sid, exchange)
                        && should_escalate
                    {
                        tracing::warn!(
                            session_id = %sid,
                            vendor = %host,
                            "slow-leak exfiltration pattern detected in session"
                        );
                    }
                }

                match result.merged_verdict.final_action {
                    VerdictAction::Block => {
                        tracing::info!(
                            vendor = %host,
                            action = "block",
                            "policy pipeline blocked CONNECT request"
                        );
                        return Ok(Response::builder()
                            .status(StatusCode::FORBIDDEN)
                            .header("content-type", "application/json")
                            .body(full_body(
                                serde_json::to_vec(&serde_json::json!({
                                    "error": "policy_blocked",
                                    "message": "Request blocked by policy"
                                }))
                                .expect("JSON serialization should never fail"),
                            ))
                            .expect("Response builder with valid status should never fail"));
                    }
                    VerdictAction::Allow | VerdictAction::Redact => {
                        // Allow: proceed with tunnel
                        // Redact: proceed with tunnel (content-level redaction
                        // happens in Phase 3 with sliding window buffer)
                        tracing::debug!(
                            vendor = %host,
                            action = ?result.merged_verdict.final_action,
                            "policy pipeline allows CONNECT request"
                        );
                    }
                }
            }
            Err(e) => {
                let evidence_event = RawEvidenceEvent {
                    timestamp: chrono::Utc::now(),
                    actor_identity: actor_identity.actor_id.clone(),
                    department: actor_identity.department.clone(),
                    vendor: host.clone(),
                    model: actor_identity.model.clone(),
                    prompt_hash: sha256_hex(""),
                    response_hash: String::new(),
                    prompt_text: None,
                    response_text: None,
                    policy_action: "block".to_string(),
                    policy_rules: vec!["pipeline_error".to_string()],
                    token_count: 0,
                    enforcement_latency_us: enforcement_start.elapsed().as_micros() as u64,
                };
                evidence_buffer.try_send(evidence_event);

                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "policy pipeline evaluation error, fail-closed"
                );
                return Ok(Response::builder()
                    .status(StatusCode::FORBIDDEN)
                    .header("content-type", "application/json")
                    .body(full_body(
                        serde_json::to_vec(&serde_json::json!({
                            "error": "policy_error",
                            "message": "Policy evaluation failed, request blocked (fail-closed)"
                        }))
                        .expect("JSON serialization should never fail"),
                    ))
                    .expect("Response builder with valid status should never fail"));
            }
        }
    }

    let connect_timeout = Duration::from_millis(config.proxy.connect_timeout_ms);
    let stream_timeout = Duration::from_millis(config.proxy.stream_timeout_ms);

    // 2. Return 200 to complete the CONNECT handshake.
    // The actual tunnel work happens in the spawned task after the upgrade.
    tokio::spawn(async move {
        // 3a. Upgrade the connection to get the raw TCP stream
        let upgraded = match hyper::upgrade::on(req).await {
            Ok(upgraded) => upgraded,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "upgrade failed"
                );
                return;
            }
        };

        // 3b. Get domain-specific TLS server config for client-side TLS termination
        let server_config = match cert_cache.get_or_create(&host).await {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "failed to get TLS cert for domain"
                );
                return;
            }
        };

        // Create TLS acceptor and terminate client TLS
        let tls_acceptor = tokio_rustls::TlsAcceptor::from(server_config);
        let client_tls = match tls_acceptor.accept(TokioIo::new(upgraded)).await {
            Ok(stream) => stream,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "TLS handshake with client failed"
                );
                return;
            }
        };

        tracing::debug!(vendor = %host, "client TLS terminated");

        // 3c. Connect to upstream vendor
        let upstream_tls =
            match tokio::time::timeout(connect_timeout, connect_upstream(&pool, &host, port)).await
            {
                Ok(Ok(stream)) => stream,
                Ok(Err(e)) => {
                    tracing::error!(
                        vendor = %host,
                        error = %e,
                        "failed to connect to upstream vendor"
                    );
                    return;
                }
                Err(_) => {
                    tracing::error!(
                        vendor = %host,
                        timeout_ms = config.proxy.connect_timeout_ms,
                        "upstream connect timeout"
                    );
                    return;
                }
            };

        tracing::debug!(vendor = %host, "upstream TLS established");

        // 3d. Relay bytes with content inspection on outbound direction
        let relay_result = tokio::time::timeout(stream_timeout, async {
            if let Some(ref inspector) = content_inspector {
                // Split TLS streams into read/write halves
                let (client_read, client_write) = tokio::io::split(client_tls);
                let (upstream_read, upstream_write) = tokio::io::split(upstream_tls);

                // Outbound (client -> upstream): inspect before forwarding
                let outbound_future = relay::inspecting_relay_outbound(
                    client_read,
                    upstream_write,
                    inspector.clone(),
                );

                // Inbound (upstream -> client): inspect responses before forwarding
                let inbound_inspector = inspector.clone();
                let inbound_future = relay::inspecting_relay_inbound(
                    upstream_read,
                    client_write,
                    inbound_inspector,
                );

                // Run both directions concurrently; use select! so a block on either
                // direction causes both to terminate (dropping the other future
                // closes its IO handles, propagating EOF).
                tokio::select! {
                    result = outbound_future => {
                        match result {
                            Ok(bytes) => Ok((bytes, 0u64)),
                            Err(reason) => {
                                tracing::warn!(
                                    vendor = %host,
                                    reason = %reason,
                                    "outbound content blocked -- tunnel severed"
                                );
                                Err(std::io::Error::new(
                                    std::io::ErrorKind::ConnectionAborted,
                                    reason,
                                ))
                            }
                        }
                    }
                    result = inbound_future => {
                        match result {
                            Ok(bytes) => Ok((0u64, bytes)),
                            Err(reason) => {
                                tracing::warn!(
                                    vendor = %host,
                                    reason = %reason,
                                    "inbound content redacted or blocked"
                                );
                                Err(std::io::Error::new(
                                    std::io::ErrorKind::ConnectionAborted,
                                    reason,
                                ))
                            }
                        }
                    }
                }
            } else {
                // No inspector -- use original zero-copy bidirectional relay
                relay::bidirectional(client_tls, upstream_tls).await
            }
        })
        .await;

        match relay_result {
            Ok(Ok((c2u, u2c))) => {
                tracing::info!(
                    vendor = %host,
                    client_to_upstream = c2u,
                    upstream_to_client = u2c,
                    "tunnel closed"
                );
            }
            Ok(Err(e)) => {
                tracing::warn!(
                    vendor = %host,
                    error = %e,
                    "tunnel relay error"
                );
            }
            Err(_) => {
                tracing::warn!(
                    vendor = %host,
                    timeout_ms = config.proxy.stream_timeout_ms,
                    "stream timeout exceeded"
                );
            }
        }
    });

    // Return 200 immediately to complete the CONNECT handshake.
    // The tunnel runs asynchronously in the spawned task.
    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(empty_body())
        .expect("Response builder with valid status should never fail"))
}

/// Establish a TLS connection to the upstream vendor.
///
/// Uses the connection pool's TLS connector for standard certificate
/// validation against webpki root certificates.
async fn connect_upstream(
    pool: &ConnectionPool,
    host: &str,
    port: u16,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>, ProxyError> {
    pool.connect_tls(host, port).await
}

/// Tower Service that dispatches CONNECT requests to the tunnel handler.
///
/// Non-CONNECT requests receive 400 Bad Request -- this is an explicit
/// forward proxy that only supports HTTPS CONNECT (per CONTEXT.md).
#[derive(Clone)]
pub struct ProxyService {
    cert_cache: Arc<CertCache>,
    pool: Arc<ConnectionPool>,
    config: Arc<Config>,
    pipeline: Option<Arc<PolicyPipeline>>,
    content_inspector: Option<Arc<ContentInspector>>,
    evidence_buffer: Arc<EvidenceBuffer>,
    full_text_storage: bool,
    /// ArcSwap-based policy set manager for hot-reload (Phase 6).
    /// When present, policies are loaded dynamically from control plane.
    policy_set_manager: Option<Arc<PolicySetManager>>,
    /// Session context store for multi-turn conversation tracking (Phase 6).
    /// When present, session context is tracked per request.
    session_store: Option<Arc<SessionStore>>,
    /// Evidence delivery health for fail-closed enforcement (Phase 19).
    /// When `high_assurance` is true and delivery is unhealthy, requests are blocked.
    delivery_health: Option<Arc<DeliveryHealth>>,
    /// When true, the proxy refuses requests if evidence delivery is unhealthy.
    high_assurance: bool,
}

impl ProxyService {
    /// Create a new ProxyService with shared state.
    pub fn new(cert_cache: Arc<CertCache>, pool: Arc<ConnectionPool>, config: Arc<Config>) -> Self {
        Self {
            cert_cache,
            pool,
            config,
            pipeline: None,
            content_inspector: None,
            evidence_buffer: Arc::new(EvidenceBuffer::stub()),
            full_text_storage: false,
            policy_set_manager: None,
            session_store: None,
            delivery_health: None,
            high_assurance: false,
        }
    }

    /// Create a new ProxyService with a policy pipeline.
    pub fn with_pipeline(
        cert_cache: Arc<CertCache>,
        pool: Arc<ConnectionPool>,
        config: Arc<Config>,
        pipeline: Arc<PolicyPipeline>,
        evidence_buffer: Arc<EvidenceBuffer>,
        full_text_storage: bool,
    ) -> Self {
        Self {
            cert_cache,
            pool,
            config,
            pipeline: Some(pipeline),
            content_inspector: None,
            evidence_buffer,
            full_text_storage,
            policy_set_manager: None,
            session_store: None,
            delivery_health: None,
            high_assurance: false,
        }
    }

    /// Create a new ProxyService with a policy pipeline and distribution support.
    ///
    /// When `policy_set_manager` is Some, the proxy loads the current PolicySet
    /// via ArcSwap on each request for dynamic policy evaluation.
    /// When `session_store` is Some, session context is tracked per request.
    #[allow(clippy::too_many_arguments)]
    pub fn with_distribution(
        cert_cache: Arc<CertCache>,
        pool: Arc<ConnectionPool>,
        config: Arc<Config>,
        pipeline: Arc<PolicyPipeline>,
        evidence_buffer: Arc<EvidenceBuffer>,
        full_text_storage: bool,
        policy_set_manager: Option<Arc<PolicySetManager>>,
        session_store: Option<Arc<SessionStore>>,
    ) -> Self {
        Self {
            cert_cache,
            pool,
            config,
            pipeline: Some(pipeline),
            content_inspector: None,
            evidence_buffer,
            full_text_storage,
            policy_set_manager,
            session_store,
            delivery_health: None,
            high_assurance: false,
        }
    }

    /// Add a content inspector to this ProxyService (builder pattern).
    ///
    /// The content inspector is used for outbound byte-level inspection
    /// in the CONNECT tunnel relay. Phase 3 inspects outbound prompts
    /// at the chunk level; structured JSON body parsing is Phase 6.
    pub fn with_content_inspector(mut self, inspector: Arc<ContentInspector>) -> Self {
        self.content_inspector = Some(inspector);
        self
    }

    /// Enable high-assurance mode: block all requests when evidence
    /// delivery is persistently failing (Phase 19 fail-closed invariant).
    pub fn with_high_assurance(mut self, health: Arc<DeliveryHealth>) -> Self {
        self.delivery_health = Some(health);
        self.high_assurance = true;
        self
    }
}

impl Service<Request<Incoming>> for ProxyService {
    type Response = Response<ProxyBody>;
    type Error = std::convert::Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<Incoming>) -> Self::Future {
        let cert_cache = self.cert_cache.clone();
        let pool = self.pool.clone();
        let config = self.config.clone();
        let pipeline = self.pipeline.clone();
        let content_inspector = self.content_inspector.clone();
        let evidence_buffer = self.evidence_buffer.clone();
        let full_text_storage = self.full_text_storage;
        let policy_set_manager = self.policy_set_manager.clone();
        let session_store = self.session_store.clone();
        let delivery_health = self.delivery_health.clone();
        let high_assurance = self.high_assurance;

        Box::pin(async move {
            // Phase 19: High-assurance fail-closed check.
            // If evidence delivery has been persistently failing, refuse new
            // requests to prevent unaudited AI usage.
            if high_assurance {
                if let Some(ref health) = delivery_health {
                    if health.is_unhealthy() {
                        tracing::error!(
                            consecutive_failures = health.consecutive_failures.load(
                                std::sync::atomic::Ordering::Relaxed
                            ),
                            "high-assurance mode: blocking request due to evidence delivery failure"
                        );
                        return Ok(Response::builder()
                            .status(StatusCode::SERVICE_UNAVAILABLE)
                            .header("content-type", "application/json")
                            .body(full_body(
                                serde_json::to_vec(&serde_json::json!({
                                    "error": "evidence_delivery_unavailable",
                                    "message": "Request blocked: evidence audit trail is unavailable (high-assurance mode)"
                                }))
                                .expect("JSON serialization should never fail"),
                            ))
                            .expect("Response builder with valid status should never fail"));
                    }
                }
            }

            // Phase 19: Extract actor identity from request headers.
            let actor_identity = ActorIdentity::from_headers(req.headers());

            // Session context tracking (Phase 6): resolve session ID from headers
            // and record the exchange after pipeline evaluation.
            let session_id = if session_store.is_some() {
                let headers = req.headers();
                let vendor = req
                    .uri()
                    .authority()
                    .map(|a| a.host().to_string())
                    .unwrap_or_default();
                Some(session::resolve_session_id(headers, &actor_identity.actor_id, &vendor))
            } else {
                None
            };

            // Phase 6.1 INT-02: Wire live PolicySet into enforcement path.
            // When PolicySetManager has a non-empty set (version > 0, policies present),
            // build a request-scoped pipeline from the live set. Otherwise, fall back
            // to the static pipeline created at startup.
            let effective_pipeline = if let Some(ref psm) = policy_set_manager {
                let current = psm.load();
                if current.version > 0 && !current.policies.is_empty() {
                    tracing::debug!(
                        policy_version = current.version,
                        policy_count = current.policies.len(),
                        "using live policy set for enforcement"
                    );
                    pipeline
                        .as_ref()
                        .map(|base| Arc::new(base.with_live_set(&current)))
                } else {
                    tracing::debug!("policy set empty (version 0), using static pipeline");
                    pipeline.clone()
                }
            } else {
                pipeline.clone()
            };

            if req.method() == Method::CONNECT {
                match handle_connect(
                    req,
                    cert_cache,
                    pool,
                    config,
                    effective_pipeline,
                    content_inspector,
                    evidence_buffer.clone(),
                    full_text_storage,
                    session_store,
                    session_id,
                    actor_identity,
                )
                .await
                {
                    Ok(response) => Ok(response),
                    Err(e) => {
                        tracing::error!(error = %e, "CONNECT handler error");
                        Ok(error_response_for(e))
                    }
                }
            } else {
                // Non-CONNECT requests are not supported.
                // This is an explicit forward proxy: HTTPS CONNECT only.
                tracing::warn!(
                    method = %req.method(),
                    uri = %req.uri(),
                    "non-CONNECT request rejected"
                );
                Ok(Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .header("content-type", "application/json")
                    .body(full_body(
                        serde_json::to_vec(&serde_json::json!({
                            "error": "method_not_supported",
                            "message": "Only CONNECT requests are supported. This is an explicit HTTPS forward proxy."
                        }))
                        .expect("JSON serialization should never fail"),
                    ))
                    .expect("Response builder with valid status should never fail"))
            }
        })
    }
}

fn build_evidence_event(
    host: &str,
    full_text_storage: bool,
    request_context: &RequestContext,
    result: &crate::policy::PipelineResult,
    enforcement_latency: Duration,
    identity: &ActorIdentity,
) -> RawEvidenceEvent {
    let prompt_text = if full_text_storage {
        request_context.content.clone()
    } else {
        None
    };

    let policy_rules = result
        .merged_verdict
        .policy_verdicts
        .iter()
        .map(|verdict| verdict.policy_id.clone())
        .collect();

    RawEvidenceEvent {
        timestamp: chrono::Utc::now(),
        actor_identity: identity.actor_id.clone(),
        department: identity.department.clone(),
        vendor: host.to_string(),
        model: identity.model.clone(),
        prompt_hash: sha256_hex(request_context.content.as_deref().unwrap_or("")),
        response_hash: String::new(),
        prompt_text,
        response_text: None,
        policy_action: verdict_action_to_str(result.merged_verdict.final_action).to_string(),
        policy_rules,
        token_count: 0,
        enforcement_latency_us: enforcement_latency.as_micros() as u64,
    }
}

fn verdict_action_to_str(action: VerdictAction) -> &'static str {
    match action {
        VerdictAction::Allow => "allow",
        VerdictAction::Redact => "redact",
        VerdictAction::Block => "block",
    }
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Map a ProxyError to an appropriate HTTP error response.
fn error_response_for(err: ProxyError) -> Response<ProxyBody> {
    match err {
        ProxyError::MissingAuthority => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("content-type", "application/json")
            .body(full_body(
                serde_json::to_vec(&serde_json::json!({
                    "error": "missing_authority",
                    "message": "CONNECT request must include host:port authority"
                }))
                .expect("JSON serialization should never fail"),
            ))
            .expect("Response builder with valid status should never fail"),
        ProxyError::VendorBlocked(ref vendor) => crate::error::vendor_blocked_response(vendor),
        ProxyError::PoolExhausted(ref vendor) => {
            let body = serde_json::to_vec(&serde_json::json!({
                "error": "pool_exhausted",
                "vendor": vendor,
                "message": "All connections to this vendor are at maximum capacity"
            }))
            .expect("JSON serialization should never fail");
            Response::builder()
                .status(StatusCode::SERVICE_UNAVAILABLE)
                .header("content-type", "application/json")
                .header("retry-after", "1")
                .body(full_body(body))
                .expect("Response builder with valid status should never fail")
        }
        _ => {
            let body = serde_json::to_vec(&serde_json::json!({
                "error": "internal_error",
                "message": err.to_string()
            }))
            .expect("JSON serialization should never fail");
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header("content-type", "application/json")
                .body(full_body(body))
                .expect("Response builder with valid status should never fail")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::verdict::{MergedVerdict, PolicyVerdict};

    /// Test ProxyService via a real hyper client-server connection.
    /// This validates the full Tower service stack works with hyper's Service trait.
    #[tokio::test]
    async fn test_proxy_service_rejects_non_connect() {
        let cert_cache = create_test_cert_cache();
        let pool = Arc::new(ConnectionPool::new(
            &crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            Duration::from_secs(10),
        ));
        let config = Arc::new(test_config());

        let svc = ProxyService::new(cert_cache, pool, config);

        // Set up a real TCP listener/connection pair for hyper
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_handle = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let io = TokioIo::new(stream);
            let hyper_svc = hyper_util::service::TowerToHyperService::new(svc);
            hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                .serve_connection(io, hyper_svc)
                .await
                .ok();
        });

        // Connect as a client and send a GET request
        let tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
        tokio::spawn(conn);

        let req = Request::builder()
            .method(Method::GET)
            .uri("/v1/chat")
            .header("host", "api.openai.com")
            .body(Empty::<Bytes>::new())
            .unwrap();

        let resp = sender.send_request(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "method_not_supported");

        server_handle.abort();
    }

    /// Test that CONNECT requests return 200 for tunnel establishment.
    #[tokio::test]
    async fn test_proxy_service_accepts_connect() {
        let cert_cache = create_test_cert_cache();
        let pool = Arc::new(ConnectionPool::new(
            &crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            Duration::from_secs(10),
        ));
        let config = Arc::new(test_config());

        let svc = ProxyService::new(cert_cache, pool, config);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_handle = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let io = TokioIo::new(stream);
            let hyper_svc = hyper_util::service::TowerToHyperService::new(svc);
            hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                .serve_connection_with_upgrades(io, hyper_svc)
                .await
                .ok();
        });

        // Connect as HTTP/1.1 client and send CONNECT
        let tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
        tokio::spawn(conn);

        let req = Request::builder()
            .method(Method::CONNECT)
            .uri("api.openai.com:443")
            .body(Empty::<Bytes>::new())
            .unwrap();

        let resp = sender.send_request(req).await.unwrap();
        // CONNECT should return 200 (the tunnel spawns asynchronously)
        assert_eq!(resp.status(), StatusCode::OK);

        server_handle.abort();
    }

    #[tokio::test]
    async fn test_error_response_missing_authority() {
        let resp = error_response_for(ProxyError::MissingAuthority);
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_error_response_pool_exhausted() {
        let resp = error_response_for(ProxyError::PoolExhausted("api.openai.com".to_string()));
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_error_response_vendor_blocked() {
        let resp = error_response_for(ProxyError::VendorBlocked("evil.ai".to_string()));
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn test_error_response_vendor_unreachable() {
        let resp = error_response_for(ProxyError::VendorUnreachable {
            vendor: "api.openai.com".to_string(),
            source: std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused"),
        });
        assert_eq!(resp.status(), StatusCode::BAD_GATEWAY);
    }

    fn create_test_cert_cache() -> Arc<CertCache> {
        let mut params =
            rcgen::CertificateParams::new(Vec::<String>::new()).expect("empty SAN list");
        params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
        params
            .distinguished_name
            .push(rcgen::DnType::CommonName, "Test CA");

        let key_pair = rcgen::KeyPair::generate().expect("key generation");
        let cert = params.self_signed(&key_pair).expect("self-signed CA cert");

        Arc::new(CertCache::new(cert, key_pair))
    }

    fn test_config() -> Config {
        Config {
            proxy: crate::config::ProxyConfig {
                listen_addr: "127.0.0.1:8443".to_string(),
                connect_timeout_ms: 10_000,
                first_byte_timeout_ms: 30_000,
                stream_timeout_ms: 300_000,
                max_request_queue: 1024,
            },
            tls: crate::config::TlsConfig {
                ca_cert_path: "/tmp/test-ca.crt".to_string(),
                ca_key_path: "/tmp/test-ca.key".to_string(),
            },
            pool: crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            allowlist: crate::config::AllowlistConfig {
                vendors: vec!["api.openai.com".to_string()],
            },
            logging: crate::config::LoggingConfig {
                level: "info".to_string(),
                format: "json".to_string(),
            },
            policy: crate::config::PolicyEngineConfig::default(),
        }
    }

    #[test]
    fn evidence_event_captures_pipeline_fields_with_anonymous_identity() {
        let request_context = RequestContext {
            request_id: uuid::Uuid::new_v4(),
            vendor: "api.openai.com".to_string(),
            method: "CONNECT".to_string(),
            path: "api.openai.com:443".to_string(),
            content_type: None,
            content: Some("sensitive prompt".to_string()),
            direction: Direction::Outbound,
        };

        let policy_verdict = PolicyVerdict {
            policy_id: "policy:test".to_string(),
            action: VerdictAction::Block,
            redactions: vec![],
            reason: Some("blocked".to_string()),
        };

        let result = crate::policy::PipelineResult {
            merged_verdict: MergedVerdict::merge(vec![policy_verdict]),
            trace: crate::policy::verdict::VerdictTrace {
                request_id: request_context.request_id,
                merged_verdict: MergedVerdict::merge(vec![]),
                layer1_results: vec![],
                layer2_classification: None,
                layer3_decision: None,
                timestamp: chrono::Utc::now(),
            },
            redaction_result: None,
        };

        // Anonymous identity: no headers provided.
        let identity = ActorIdentity::anonymous();
        let event = build_evidence_event(
            "api.openai.com",
            true,
            &request_context,
            &result,
            Duration::from_micros(700),
            &identity,
        );

        assert_eq!(event.vendor, "api.openai.com");
        assert_eq!(event.actor_identity, "anonymous");
        assert_eq!(event.department, "unknown");
        assert_eq!(event.model, "unknown");
        assert_eq!(event.policy_action, "block");
        assert_eq!(event.policy_rules, vec!["policy:test".to_string()]);
        assert_eq!(event.prompt_text, Some("sensitive prompt".to_string()));
        assert_eq!(event.response_hash, "");
        assert_eq!(event.token_count, 0);
        assert_eq!(event.enforcement_latency_us, 700);
    }

    #[test]
    fn evidence_event_captures_real_identity() {
        let request_context = RequestContext {
            request_id: uuid::Uuid::new_v4(),
            vendor: "api.openai.com".to_string(),
            method: "CONNECT".to_string(),
            path: "api.openai.com:443".to_string(),
            content_type: None,
            content: Some("hello".to_string()),
            direction: Direction::Outbound,
        };

        let result = crate::policy::PipelineResult {
            merged_verdict: MergedVerdict::merge(vec![]),
            trace: crate::policy::verdict::VerdictTrace {
                request_id: request_context.request_id,
                merged_verdict: MergedVerdict::merge(vec![]),
                layer1_results: vec![],
                layer2_classification: None,
                layer3_decision: None,
                timestamp: chrono::Utc::now(),
            },
            redaction_result: None,
        };

        let identity = ActorIdentity {
            actor_id: "alice@corp.example".to_string(),
            department: "legal".to_string(),
            model: "gpt-4o".to_string(),
        };
        let event = build_evidence_event(
            "api.openai.com",
            false,
            &request_context,
            &result,
            Duration::from_micros(500),
            &identity,
        );

        assert_eq!(event.actor_identity, "alice@corp.example");
        assert_eq!(event.department, "legal");
        assert_eq!(event.model, "gpt-4o");
        assert_eq!(event.prompt_text, None); // full_text_storage = false
    }
}
