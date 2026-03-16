# M009: Foundation Hardening (v1.7)

**Gathered:** 2026-03-16
**Status:** Ready for planning

## Project Description

Interdict.io is a kernel-level AI governance and compliance platform. v1.6 completed assessment remediation across all 28 findings from the v1.5 deep assessment. A comprehensive v1.6 foundation assessment on 2026-03-15 reviewed all 382 source files and identified 41 remaining findings (4 high, 12 medium, 25 low) plus 4 systemic gaps. This milestone closes every finding to bring the codebase to a clean A- across all dimensions before building new product features.

## Why This Milestone

The v1.6 assessment confirmed the foundation is strong (A/A- on architecture, Rust quality, security, TypeScript quality), but identified gaps that become real risks at scale:

- **Evidence pipeline resilience:** ClickHouse writes silently drop data on failure, S3 Merkle anchors are permanently lost on error — the most critical data path has zero retry logic
- **Security defense-in-depth:** BFF proxy forwards to any API path without validation, Helm chart deploys with empty database password, dev DB credentials fall back silently
- **Rate limiting scope:** Only 3 auth endpoints are rate-limited — write endpoints and expensive operations are unbounded
- **Dashboard correctness:** Render-phase side effects violate React's contract and will break under concurrent rendering
- **Infrastructure consistency:** Docker Compose cert-init runs as root (Helm equivalent doesn't), CI tool downloads lack integrity verification

These gaps are manageable at pilot scale but would become liabilities with external-facing deployments, compliance audits, or team scaling.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Trust that evidence bundles are never silently lost — failed ClickHouse writes retry with backoff and spill to dead-letter on exhaustion
- Trust that Merkle WORM anchors are persisted locally before S3 upload, with automatic recovery on startup
- Deploy via Helm with confidence that required credentials are validated at render time — no silent empty-password deployments
- See Prometheus metrics for evidence pipeline health, HTTP request rates, rate limit rejections, and policy compilations
- Verify individual bundle inclusion via Merkle proofs without needing all bundles from the same time window
- Run a deterministic Rust test suite with zero flaky tests

### Entry point / environment

- Entry point: `cargo test --workspace`, `bun test`, `npx vitest run`, CI pipeline, `docker compose up`, `helm install`
- Environment: local dev (Windows + WSL), CI (GitHub Actions), Docker, Kubernetes
- Live dependencies involved: GitHub Actions (CI/CD), Docker (integration tests)

## Completion Class

- Contract complete means: all 41 finding fixes verified by tests, lint checks, or structural grep; CI pipeline passes
- Integration complete means: Docker Compose deploys with hardened cert-init; cross-service integration test passes; Prometheus scrapes app-level metrics
- Operational complete means: evidence pipeline retries on failure; dead-letter queue captures exhausted rows; Merkle anchors survive S3 outages; startup recovery re-uploads pending anchors

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `cargo test --workspace --all-targets` passes with zero failures (flaky test fixed)
- `bun test` passes (396+ pass, 0 new failures)
- `npx vitest run` passes (385+ pass, 0 new failures)
- Evidence writer retry test proves rows are retried on ClickHouse failure
- Merkle anchor test proves local persistence before S3 and recovery on startup
- `helm template` with empty postgresql.auth.password fails with clear error
- BFF proxy rejects disallowed paths with 403
- All 41 assessment findings addressed — `final_assessment.md` can be regenerated with zero high/medium findings
- `curl localhost:9090/metrics` returns Prometheus-format metrics from evidence-collector

## Risks and Unknowns

- Dead-letter file format — JSON serialization of EvidenceRow must be roundtrip-safe for future replay
- Merkle anchor recovery — startup scan of pending anchors must handle partial writes and corrupted files
- Proto `max_len = 0` on deprecated fields — may require `ignore_empty` or a different constraint mechanism
- Prometheus metrics in Bun/Elysia — `prom-client` compatibility with Bun runtime

## Existing Codebase / Prior Art

- `crates/evidence-collector/src/storage/clickhouse.rs` — ClickHouse inserter worker with no retry logic
- `crates/evidence-collector/src/merkle/builder.rs` — Merkle rotation that resets before S3 write
- `dashboard/src/app/api/proxy/[...path]/route.ts` — BFF proxy without path validation
- `helm/interdict/templates/_helpers.tpl` — Helm helpers without required value checks
- `control-plane/src/modules/auth/rate-limiter.ts` — Rate limiter applied to auth endpoints only
- `crates/kernel/src/policy/layer3/queue.rs` — Flaky test with timing-dependent sleep
- `proto/interdict/evidence/v1/evidence.proto` — Deprecated fields with 1MB max_len

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- FH-INTEGRITY-01 — Evidence pipeline retries ClickHouse writes and persists Merkle anchors before S3
- FH-SECURITY-01 — BFF proxy validates paths, Helm requires credentials, dev fallbacks require opt-in
- FH-SECURITY-02 — Rate limiting covers write endpoints and expensive operations
- FH-QUALITY-01 — Zero flaky tests, render-phase side effects fixed, dead code removed
- FH-INFRA-01 — Docker/Helm security contexts consistent, CI tool integrity verified
- FH-OBSERVABILITY-01 — Prometheus metrics for evidence pipeline, HTTP requests, and rate limiting
- FH-TESTING-01 — Collector→verifier roundtrip test, Merkle proof generation/verification

## Scope

### In Scope

- Fix all 41 assessment findings (4 high, 12 medium, 25 low)
- Write tests for all fixes
- Add Prometheus metrics endpoints to evidence-collector and control-plane
- Add Merkle proof generation and verification
- Add collector→verifier integration test
- Update operator documentation where fixes change behavior

### Out of Scope / Non-Goals

- New product features or capabilities
- Redis-backed rate limiting (deferred to horizontal scaling milestone)
- Distributed tracing / OpenTelemetry integration (future milestone)
- Full air-gapped deployment verification
- Performance optimization

## Technical Constraints

- Rust edition 2024, MSRV supporting std::sync::LazyLock
- Must not break existing 1000+ test suite
- Evidence pipeline changes must be backward-compatible (existing data not affected)
- Helm chart changes must include migration guidance for existing deployments
- Docker Compose changes must pass `docker compose config` validation

## Integration Points

- GitHub Actions CI — SHA-verified tool downloads, updated workflow
- Docker Compose — cert-init hardening, network isolation, volume mount changes
- Helm chart — required value checks, ConfigMap cleanup, security contexts
- Prometheus — new scrape targets for app-level metrics
- Evidence pipeline — retry logic, dead-letter queue, Merkle anchor persistence
- BFF proxy — path allowlist, body size limits
