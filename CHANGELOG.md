# Changelog

All notable changes to Interdict are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.7.0] - M009: Foundation Hardening

### Added
- ClickHouse commit retry with exponential backoff and dead-letter persistence.
- Merkle proof generation from persisted `MerkleAnchor.chain_hashes`.
- Evidence deduplication tracker (insertion-order `VecDeque` + `HashMap`, 100K capacity).
- Prometheus metrics endpoints for both Rust evidence-collector and TypeScript control-plane.
- SAML SLO session revocation (fail-open — logs warning, doesn't block logout).
- Department-scoped RBAC with FK migration.
- Module-level tick manager for shared SLA timer intervals.
- `useRef`-stabilized callback pattern for parent-to-child props in `useEffect`.
- `InserterBatchSettings` struct to avoid clippy `too_many_arguments`.
- `devFallback()` closure pattern gating dev defaults behind `ALLOW_DEV_DEFAULTS=true`.
- `isProduction` moved inside `loadConfig()` for testability.
- Hand-written migration 0004 for department FK + rolePermissions drop.
- Integration test scripts for evidence pipeline and policy distribution.
- `interdict-verify` crate for offline evidence chain verification.

### Changed
- CA validity reduced from 10 years to 1 year with 30-day expiry warning.
- cert-init removed from `data` network (uses default bridge for `apk add openssl`).
- Hand-rolled Prometheus text format for evidence-collector (avoids ~200KB `prometheus` crate dep).
- `prom-client` with dedicated Registry for Bun compatibility (no `collectDefaultMetrics`).
- Elysia `path` from context in `onAfterResponse` instead of parsing `request.url`.
- `pending_rows` Vec buffers rows since last successful commit for dead-lettering.
- Custom serde hex modules (`hex_array`, `hex_array_vec`) for `[u8; 32]` JSON representation.
- Local-first anchor persistence: persist to disk before builder reset, delete after S3 confirm.

### Security
- `ALLOW_DEV_DEFAULTS` env var required for non-production credential fallbacks.
- `COOKIE_SECURE` env var override for staging environments with HTTPS.
- Grafana `ADMIN_PASSWORD` uses `:?` (required) syntax in Docker Compose.

## [1.6.0] - M008: Assessment Remediation

### Added
- CI supply chain hardening: SHA-pinned GitHub Actions, OPA binary checksums, digest-pinned Docker base images.
- Rate limiting on auth endpoints.
- SAML integration tests.
- Session cleanup on expiry.
- CSV formula injection defense (`escapeCSV()` sanitization).
- TypeBox `maxLength` tiers for all string inputs.
- Body size limits (dual-layer: `Content-Length` check + Bun `maxRequestBodySize`).
- Docker Compose network segmentation (`data`, `control`, `frontend` networks) and resource limits.
- Helm security contexts, RBAC, `ServiceAccount` with `automountServiceAccountToken: false`.
- Cross-service integration tests with ephemeral Docker Compose test profile.
- Proto validation annotations (`buf/validate`).
- Certificate hygiene: 1-year CA, expiry monitoring, rotation documentation.

## [1.5.0] - M007: Production Readiness

### Added
- CI/CD release pipeline with cosign-signed multi-platform Docker images and SBOM.
- CSP nonce hardening for dashboard.
- Helm network policies.
- Prometheus + Grafana monitoring stack (`docker-compose.monitoring.yml`).
- Backup script with S3/MinIO and PostgreSQL dump.
- Environment validation script (`scripts/validate-env.sh`).
- Operator guide, troubleshooting guide, full-text storage guide.
- REST API reference (53 endpoints) and gRPC API reference.
- WCAG AA accessibility for dashboard.
- Property-based tests (`proptest`) for PII pattern library fuzzing.
- Hot-reload stress tests (50 concurrent readers + rapid ArcSwap).
- `cargo deny` integration for license compliance and duplicate crate detection.
- CI coverage reporting via `cargo-llvm-cov`.

### Changed
- Eliminated all `unwrap()`/`expect()` calls from hot-path pattern initialization using `LazyLock`.
- `InjectionDetector::default()` is now infallible.
- Regorus semaphore path returns fail-mode verdict instead of panicking.
- Centralized workspace `[lints]` in root `Cargo.toml`.
- Aligned `rand` to single version (0.9) across workspace.
- Extracted kernel `main.rs` bootstrapping into `bootstrap.rs`.

### Security
- All Dockerfiles run as non-root with read-only root filesystem.
- `docker-compose.yml` uses environment variable references instead of hardcoded credentials.

## [1.2.0] - M003: Trustworthiness & Hardening

### Added
- Content inspection with PII detection, redaction, and blocking.
- Streaming inspection with sliding window buffer and stream severing.
- SHA-256 evidence hashing before mutation.
- Prompt injection and jailbreak detection (PLCY-11).
- Custom enterprise pattern support (regex + examples).

### Security
- Fail-closed enforcement for high-risk policy profiles.
- Evidence chain integrity with tamper-evident hashing.

## [1.1.0] - M002: Pilot Ready

### Added
- Identity and session management.
- SAML SSO authentication.
- Next.js compliance dashboard with 10+ views and SSE streaming.
- Docker Compose deployment with sidecar proxy mode.
- Kubernetes Helm chart with production-grade templates.
- Control-plane API (TypeScript/Bun) for policy management.
- gRPC evidence collector with mTLS.

## [1.0.0] - M001: MVP

### Added
- Kernel proxy with TLS interception via deployment-unique CA.
- Three-layer policy pipeline: L1 (Rego/Wasm), L2 (ONNX classifier), L3 (human review queue).
- Vendor allowlist enforcement.
- Connection pooling with backpressure (KERN-13 bounded channels).
- Evidence buffer with async gRPC delivery.
- 8 regulatory framework packs (EU AI Act, GDPR, NIST AI RMF, etc.).
- Structured logging with tracing.
