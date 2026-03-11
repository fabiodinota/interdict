//! Request ID middleware for structured log correlation.
//!
//! Generates a UUID v4 for each request and attaches it as an
//! `x-request-id` header and tracing span field. This enables
//! structured log correlation across the entire request lifecycle.

use http::{Request, Response};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tower::{Layer, Service};

/// Tower `Layer` that wraps a service with request ID generation.
#[derive(Clone, Default)]
pub struct RequestIdLayer;

impl RequestIdLayer {
    /// Create a new `RequestIdLayer`.
    pub fn new() -> Self {
        Self
    }
}

impl<S> Layer<S> for RequestIdLayer {
    type Service = RequestIdService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RequestIdService { inner }
    }
}

/// Tower `Service` that generates a UUID v4 request ID for each request.
///
/// The request ID is:
/// - Inserted as `x-request-id` header on the request
/// - Used to create a tracing span for structured log correlation
#[derive(Clone)]
pub struct RequestIdService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for RequestIdService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    ReqBody: Send + 'static,
{
    type Response = Response<ResBody>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<ReqBody>) -> Self::Future {
        let request_id = uuid::Uuid::new_v4().to_string();

        // Insert request ID header
        match http::HeaderValue::from_str(&request_id) {
            Ok(header_value) => {
                req.headers_mut().insert("x-request-id", header_value);
            }
            Err(error) => {
                tracing::warn!(error = %error, "failed to encode x-request-id header");
            }
        }

        let mut inner = self.inner.clone();
        let span = tracing::info_span!("request", request_id = %request_id);

        Box::pin(async move {
            let _guard = span.enter();
            inner.call(req).await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::StatusCode;
    use std::convert::Infallible;
    /// A simple echo service that returns 200 OK for testing.
    #[derive(Clone)]
    struct EchoService;

    impl<B: Send + 'static> Service<Request<B>> for EchoService {
        type Response = Response<String>;
        type Error = Infallible;
        type Future = Pin<Box<dyn Future<Output = Result<Response<String>, Infallible>> + Send>>;

        fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }

        fn call(&mut self, req: Request<B>) -> Self::Future {
            // Extract the request ID header to verify it was set
            let request_id = req
                .headers()
                .get("x-request-id")
                .map(|v| v.to_str().unwrap().to_string())
                .unwrap_or_default();

            Box::pin(async move {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(request_id)
                    .unwrap())
            })
        }
    }

    #[tokio::test]
    async fn test_request_id_header_is_set() {
        let layer = RequestIdLayer::new();
        let mut service = layer.layer(EchoService);

        let req = Request::builder()
            .uri("https://api.openai.com/v1/chat")
            .body(())
            .unwrap();

        let resp = service.call(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // The echo service returns the request ID in the body
        let request_id = resp.into_body();
        assert!(!request_id.is_empty());

        // Verify it looks like a UUID v4 (8-4-4-4-12 format)
        assert_eq!(request_id.len(), 36);
        assert_eq!(request_id.chars().filter(|c| *c == '-').count(), 4);
    }

    #[tokio::test]
    async fn test_each_request_gets_unique_id() {
        let layer = RequestIdLayer::new();
        let mut service = layer.layer(EchoService);

        let req1 = Request::builder()
            .uri("https://api.openai.com/v1/chat")
            .body(())
            .unwrap();
        let resp1 = service.call(req1).await.unwrap();
        let id1 = resp1.into_body();

        let req2 = Request::builder()
            .uri("https://api.openai.com/v1/chat")
            .body(())
            .unwrap();
        let resp2 = service.call(req2).await.unwrap();
        let id2 = resp2.into_body();

        // Each request should get a unique ID
        assert_ne!(id1, id2);
    }
}
