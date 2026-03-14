# Changelog

All notable changes to Interdict are documented here.

## [Unreleased] - M006: Production Safety & Quality

### Changed
- Eliminated all `unwrap()`/`expect()` calls from hot-path pattern initialization using `LazyLock`.
- `InjectionDetector::default()` is now infallible.
- Regorus semaphore path returns fail-mode verdict instead of panicking.
- Centralized workspace `[lints]` in root `Cargo.toml`.
- Aligned `rand` to single version (0.9) across workspace.
- Extracted kernel `main.rs` bootstrapping into `bootstrap.rs`.

### Added
- `cargo deny` integration for license compliance and duplicate crate detection.
- Property-based tests (`proptest`) for PII pattern library fuzzing.
- CI coverage reporting via `cargo-llvm-cov`.
- `CONTRIBUTING.md` with setup, quality gates, PR process, and Windows workaround.
- This `CHANGELOG.md`.

### Security
- All Dockerfiles now run as non-root with read-only root filesystem.
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
- Next.js compliance dashboard with audit views and SSE streaming.
- Docker Compose deployment with sidecar proxy mode.
- Control-plane API (TypeScript/Bun) for policy management.
- gRPC evidence collector with mTLS.

## [1.0.0] - M001: MVP

### Added
- Kernel proxy with TLS interception via deployment-unique CA.
- Three-layer policy pipeline: L1 (Rego/Wasm), L2 (ONNX classifier), L3 (human review queue).
- Vendor allowlist enforcement.
- Connection pooling with backpressure (KERN-13 bounded channels).
- Evidence buffer with async gRPC delivery.
- Structured logging with tracing.
