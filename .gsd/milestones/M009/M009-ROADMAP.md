# M009: Foundation Hardening (v1.7)

**Vision:** Close every finding from the v1.6 foundation assessment — hardening evidence pipeline resilience, proxy security, Helm credential validation, rate limiting scope, dashboard correctness, infrastructure consistency, observability, and test coverage to achieve zero remaining findings and a clean A- composite score.

## Success Criteria

- Evidence pipeline retries ClickHouse writes with exponential backoff and spills to dead-letter file on exhaustion
- S3 Merkle anchor is persisted locally before tree reset, with startup recovery of pending anchors
- BFF proxy rejects paths outside an explicit allowlist with 403
- `helm template` with empty `postgresql.auth.password` and no `existingSecret` fails with a clear error message
- Rate limiting is applied to write endpoints and expensive operations (policy compile, report generate, key rotate)
- Dashboard render-phase side effects replaced with `useEffect` — zero React strict mode warnings
- Docker Compose cert-init runs as non-root with read-only rootfs, matching Helm equivalent
- hadolint and kube-score CI downloads verified by SHA256 checksum
- `cargo test --workspace --all-targets` passes with zero failures (flaky test fixed)
- Deprecated proto fields `prompt_text`/`response_text` reject non-empty content via validation
- Prometheus metrics endpoints exist on evidence-collector and control-plane
- Collector→verifier roundtrip test proves end-to-end chain, signature, and Merkle verification
- All 41 assessment findings have corresponding fixes with tests or structural verification

## Key Risks / Unknowns

- Dead-letter file format must survive schema evolution — JSON may be insufficient for binary proto fields
- Merkle anchor startup recovery must handle corrupted/partial files gracefully
- `buf.validate` `max_len = 0` on deprecated proto fields may not be supported — may need alternative constraint
- `prom-client` library compatibility with Bun runtime is unverified

## Proof Strategy

- Dead-letter format → retire in S01 by proving roundtrip serialization test passes for all EvidenceRow field types
- Anchor recovery → retire in S01 by proving startup scan handles corrupt files without panic
- Proto max_len=0 → retire in S06 by proving buf lint and cargo build pass with the constraint
- prom-client Bun compat → retire in S06 by proving metrics endpoint responds under `bun run`

## Verification Classes

- Contract verification: `cargo test --workspace --all-targets`, `bun test`, `npx vitest run`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --all -- --check`, `buf lint`
- Integration verification: `docker compose config` validates cert-init and network changes, `helm template` validates required credentials, Prometheus scrapes metrics endpoints
- Operational verification: evidence retry on simulated ClickHouse failure, anchor recovery on startup, dead-letter file creation
- UAT / human verification: none required (user must rotate OpenAI API key externally — flagged in L-20)

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 6 slices are complete with passing verification
- `cargo test --workspace --all-targets` passes with 0 failures
- `bun test` passes (396+ pass, ≤3 pre-existing failures)
- `npx vitest run` passes (385+ pass, 0 failures)
- Evidence writer retry test proves backoff + dead-letter behavior
- Merkle anchor local persistence + S3 retry + startup recovery test pass
- `helm template --set postgresql.auth.password=""` fails with clear error
- BFF proxy test proves 403 on disallowed paths
- Rate limiting test proves 429 on write endpoints after threshold
- `curl` to evidence-collector and control-plane `/metrics` returns Prometheus format
- Collector→verifier roundtrip integration test passes
- All 41 assessment findings addressed
- `cargo clippy --workspace --all-targets -- -D warnings` clean
- `buf lint` clean

## Requirement Coverage

- Covers: FH-INTEGRITY-01, FH-SECURITY-01, FH-SECURITY-02, FH-QUALITY-01, FH-INFRA-01, FH-OBSERVABILITY-01, FH-TESTING-01
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: Evidence Pipeline Resilience** `risk:high` `depends:[]`
  > After this: ClickHouse writes retry with exponential backoff (5 attempts) and spill to dead-letter files on exhaustion. S3 Merkle anchors are persisted locally before tree reset, with retry (3 attempts) and startup recovery of pending anchors. ClickHouse retention TTL uses configured `retention_days`. Bundle ID duplicates are rejected. Inserter batch settings are configurable via env vars. `cargo test -p evidence-collector` passes with all new tests.

- [x] **S02: Security Hardening — Proxy, Helm, Secrets** `risk:high` `depends:[]`
  > After this: BFF proxy validates paths against an allowlist and rejects unknown paths with 403. Body size is capped at 2MB. Helm chart fails to render when required passwords are empty and no existingSecret is set. DATABASE_URL is constructed in Deployment env (not ConfigMap). Dev DB fallback requires explicit `ALLOW_DEV_DEFAULTS=true`. signing_keys volume is read-only on evidence-collector. busybox init images are digest-pinned. Test compose ports bind to 127.0.0.1. OpenAI test key replaced with placeholder. `helm lint`, `npx vitest run`, and `bun test` pass.

- [x] **S03: Auth, Rate Limiting & Session Fixes** `risk:medium` `depends:[]`
  > After this: Rate limiting covers write endpoints and expensive operations (60/min API rate limit alongside 10/min auth rate limit). SAML SLO revokes server session before IdP redirect. Rate limiter falls back to socket remote address when x-forwarded-for is absent. Department schema has self-referencing FK. Dead code removed (rolePermissions table, unused session constant). `bun test` passes.

- [x] **S04: Dashboard Quality & Accessibility** `risk:medium` `depends:[]`
  > After this: Render-phase side effects in dashboard home page and ReviewQueue replaced with `useEffect`. SAML callback uses shared cookie options. SlaTimer uses single shared interval instead of per-instance. BatchVerifyTable checkboxes have aria-labels. VendorCard has aria-expanded. Anomaly severity tabs have proper ARIA roles. `npx vitest run` passes with zero warnings.

- [x] **S05: Infrastructure & CI Hardening** `risk:medium` `depends:[]`
  > After this: Docker Compose cert-init runs as non-root with read-only rootfs and no network access. hadolint and kube-score CI downloads verified by SHA256 checksum. minio-init job has full security context. Sidecar-init drops all capabilities except NET_ADMIN. Control-plane Dockerfile separates devDependencies. Workspace `unsafe_code` lint is `deny` with per-crate exceptions. Stale cert comment fixed. lint-staged Rust handler improved. `docker compose config`, `helm lint`, and `cargo clippy` pass.

- [x] **S06: Proto Safety, Observability & Testing** `risk:medium` `depends:[S01]`
  > After this: Deprecated proto fields reject non-empty content. Flaky kernel test is deterministic (notification channel replaces sleep). Timestamp nanos uses safe cast. PEM parser validates ASN.1 structure. Merkle proof generation and verification work for individual bundles. Collector→verifier roundtrip integration test passes. Prometheus metrics endpoints on evidence-collector (9090) and control-plane expose pipeline health, HTTP request rates, and rate limit stats. vitest mock hoisting warning fixed. `cargo test --workspace`, `buf lint`, `bun test`, and `npx vitest run` all pass.

## Boundary Map

### S01 (Evidence Pipeline Resilience)

Produces:
- ClickHouse writer with retry logic + `WriterHealth` struct exposing `rows_written`, `rows_retried`, `rows_dead_lettered` counters
- Dead-letter directory at `{data_dir}/dead-letter/` with JSON spillover files
- Merkle anchor local persistence at `{data_dir}/merkle-anchors/` with S3 retry and startup recovery
- `MerkleAnchor` struct extended with `chain_hashes: Vec<[u8; 32]>` for proof generation
- Configurable inserter batch settings via `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES`
- Per-kernel sequence tracking in `EvidenceService` for bundle deduplication

Consumes:
- nothing (independent slice)

### S02 (Security Hardening)

Produces:
- BFF proxy path allowlist in `dashboard/src/app/api/proxy/[...path]/route.ts`
- Helm `interdict.validateRequired` helper that fails on empty passwords
- DATABASE_URL constructed in Deployment env spec (removed from ConfigMap)
- Dev DB fallback gated behind `ALLOW_DEV_DEFAULTS` env var
- Digest-pinned busybox init container images

Consumes:
- nothing (independent slice)

### S03 (Auth, Rate Limiting & Session)

Produces:
- `apiRateLimiter` instance (60/min) applied to write endpoints
- SAML SLO server-side session revocation before IdP redirect
- Rate limiter IP resolution: x-forwarded-for → x-real-ip → socket remoteAddress → unknown
- Department self-referencing FK constraint

Consumes:
- nothing (independent slice)

### S04 (Dashboard Quality & Accessibility)

Produces:
- `useEffect`-based state updates replacing render-phase side effects
- Shared SlaTimer tick mechanism (1 interval for N timers)
- ARIA roles on anomaly tabs, aria-expanded on VendorCard, aria-labels on BatchVerifyTable

Consumes:
- nothing (independent slice)

### S05 (Infrastructure & CI Hardening)

Produces:
- Non-root cert-init in Docker Compose with `network_mode: none`
- SHA256-verified hadolint and kube-score downloads in CI workflow
- Full security contexts on minio-init and sidecar-init
- Workspace `unsafe_code = "deny"` with per-crate `allow` exceptions

Consumes:
- nothing (independent slice)

### S06 (Proto Safety, Observability & Testing) → depends on S01

Produces:
- Deprecated proto fields with `max_len = 0` (or equivalent rejection constraint)
- Deterministic review queue test (notification channel replaces sleep)
- Safe `u32::try_from()` for timestamp nanos
- ASN.1-validated PEM parsing for Ed25519 keys
- `MerkleBuilder::proof_for_bundle()` method + `interdict-verify` proof verification
- `crates/evidence-collector/tests/roundtrip_test.rs` — collector→verifier integration test
- Prometheus `/metrics` endpoints on evidence-collector (port 9090) and control-plane
- Updated Prometheus scrape config in `docker-compose.monitoring.yml`

Consumes:
- S01's `MerkleAnchor.chain_hashes` field (needed for proof generation)
- S01's `WriterHealth` counters (exposed as Prometheus metrics)
