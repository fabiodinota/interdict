# Requirements

## Active

### FH-INTEGRITY-01 — Evidence pipeline retries ClickHouse writes with backoff and persists Merkle anchors locally before S3 upload.

- Status: active
- Class: core-capability
- Source: v1.6 foundation assessment (H-01, H-02, M-02, M-03, L-04)
- Primary Slice: M009/S01

Evidence pipeline retries ClickHouse writes with exponential backoff (5 attempts) and spills to dead-letter files on exhaustion. S3 Merkle anchors are persisted locally before tree reset with retry and startup recovery. ClickHouse retention TTL uses configured retention_days. Bundle ID duplicates are rejected. Inserter batch settings are configurable.

### FH-SECURITY-01 — BFF proxy validates paths, Helm requires credentials, dev fallbacks require explicit opt-in.

- Status: active
- Class: security
- Source: v1.6 foundation assessment (H-03, H-04, M-06, M-09, M-10)
- Primary Slice: M009/S02

BFF proxy validates paths against an allowlist and rejects disallowed paths with 403. Helm chart fails to render when required passwords are empty without existingSecret. DATABASE_URL constructed in Deployment env. Dev DB fallback gated behind ALLOW_DEV_DEFAULTS.

### FH-SECURITY-02 — Rate limiting covers write endpoints and expensive operations.

- Status: active
- Class: security
- Source: v1.6 foundation assessment (M-01, M-05, L-05, L-06)
- Primary Slice: M009/S03

Rate limiting applied to policy creation, compilation, report generation, signing key rotation, and vendor creation endpoints (60/min). SAML SLO revokes server session. Rate limiter falls back to socket remote address. Review ingest auth at middleware level.

### FH-QUALITY-01 — Zero flaky tests, render-phase side effects fixed, dead code removed, accessibility improved.

- Status: active
- Class: code-quality
- Source: v1.6 foundation assessment (M-04, L-01, L-08, L-09, L-10, L-11, L-12, L-23, L-24)
- Primary Slice: M009/S04, M009/S06

Flaky kernel test uses notification channel. Render-phase side effects replaced with useEffect. SlaTimer uses shared interval. ARIA roles on anomaly tabs, aria-expanded on VendorCard, aria-labels on BatchVerifyTable. Dead code removed.

### FH-INFRA-01 — Docker/Helm security contexts consistent, CI tool integrity verified, container hardening complete.

- Status: validated
- Class: security
- Source: v1.6 foundation assessment (M-07, M-08, L-14, L-15, L-16, L-17, L-18, L-19, L-22, L-25)
- Primary Slice: M009/S05

Docker Compose cert-init runs non-root with read-only rootfs and no network. CI downloads SHA256-verified. minio-init and sidecar-init fully hardened. Workspace unsafe_code lint set to deny.

### FH-OBSERVABILITY-01 — Prometheus metrics endpoints on evidence-collector and control-plane.

- Status: active
- Class: core-capability
- Source: v1.6 foundation assessment (systemic gap)
- Primary Slice: M009/S06

Evidence-collector exposes /metrics with evidence_bundles_received_total, written_total, retried_total, dead_lettered_total, write_latency_seconds, merkle_anchors_written_total, signing_operations_total. Control-plane exposes /metrics with http_requests_total, request_duration_seconds, rate_limit_rejections_total, session_cleanup_rows_total, policy_compilations_total.

### FH-TESTING-01 — Collector→verifier roundtrip test and Merkle proof generation/verification.

- Status: active
- Class: core-capability
- Source: v1.6 foundation assessment (M-12, systemic gap)
- Primary Slice: M009/S06

Roundtrip integration test creates bundles via collector, signs and chains them, then verifies with interdict-verify. Merkle proof generation supports individual bundle inclusion verification.

## Validated

### HR-OPS-01 — Docker, Helm, proto, shell, and YAML artifacts have explicit lint/validation coverage in CI.

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: M005/S03

Docker, Helm, proto, shell, and YAML artifacts have explicit lint/validation coverage in CI.

### HR-OPS-02 — Local developer workflows clearly automate or document quality checks across Windows + WSL Rust and JS/TS surfaces.

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: M005/S03

Local developer workflows clearly automate or document quality checks across Windows + WSL Rust and JS/TS surfaces.

### HR-MAINT-01 — Remaining production-code warnings are reduced or intentionally documented, and framework migration warnings are resolved.

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: M005/S04

Remaining production-code warnings are reduced or intentionally documented, and framework migration warnings are resolved.

### HR-DOC-01 — Planning/state docs and tracked local config accurately reflect the repo's verified state.

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: M007/S08

Planning/state docs and tracked local config accurately reflect the repo's verified state.

### PR-TEST-01 — Hot-path relay modules reach ≥80% test coverage.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S01

Hot-path relay modules (relay.rs, streaming_relay.rs, tls.rs) have ≥80% line coverage with unit tests covering error paths, flush-timeout, partial-match, concurrent cache, and integration test for CONNECT tunnel redaction.

### PR-TEST-02 — Layer 3 queue and evidence signing modules reach ≥80% test coverage.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S02

Layer 3 queue/store modules and all evidence signing providers (local Ed25519, KMS mock, key rotation, chain management) are fully tested.

### PR-TEST-03 — Dashboard component test coverage expands from 9 to 40+ components.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S04

Dashboard test coverage expanded from 8→46 component test files (370 test cases) with interaction and accessibility assertions.

### PR-TEST-04 — E2E smoke test validates full stack.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S04

Playwright E2E smoke test created with docker-compose orchestration script for full-stack startup, health check, and teardown.

### PR-CICD-01 — Automated release pipeline with signed images.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S05

Tag push produces signed container images in ghcr.io with SBOM and SLSA provenance. Conventional commits enforced, changelog automated, secret scanning blocks PRs, benchmark tracking runs on main.

### PR-SEC-01 — CSP nonce-based, no unsafe-inline.

- Status: validated
- Class: security
- Source: M007 deep audit
- Primary Slice: M007/S06

Dashboard CSP uses per-request nonces with zero unsafe-inline in script-src and style-src.

### PR-SEC-02 — Network policies enabled by default in Helm.

- Status: validated
- Class: security
- Source: M007 deep audit
- Primary Slice: M007/S06

All 4 services have Helm NetworkPolicy enabled by default with CNI documentation.

### PR-SEC-03 — Secret scanning and no unaddressed security advisories.

- Status: validated
- Class: security
- Source: M007 deep audit
- Primary Slice: M007/S05, M007/S06

TruffleHog secret scanning blocks on verified/unknown findings. full_text_storage risk documented with startup warnings and operator guide.

### PR-OPS-01 — Operator guide, API docs, troubleshooting guide.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S08

578-line operator guide, 417-line troubleshooting reference, 692-line REST API reference (53 endpoints, 13 modules), 273-line gRPC API reference (2 proto services).

### PR-OPS-02 — Docker improvements (dockerignore, multi-platform).

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S07

Hardened .dockerignore with allowlist pattern, multi-platform Docker builds (amd64+arm64) via QEMU, TARGETARCH for architecture-dependent binaries.

### PR-OPS-03 — Monitoring stack, backup procedures, environment validation.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S07

Prometheus+Grafana monitoring profile, Postgres+ClickHouse backup script, validate-env.sh pre-flight checks, json-file log rotation on all Compose services.

### PR-A11Y-01 — Dashboard meets WCAG AA.

- Status: validated
- Class: core-capability
- Source: M007 deep audit
- Primary Slice: M007/S08

Dashboard passes axe-core with zero critical/serious WCAG violations. aria-label on all icon buttons, vitest-axe on 6 components, @axe-core/playwright WCAG AA check.

### AR-SUPPLY-01 — All CI supply chain references pinned to immutable identifiers.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S01

All 45 GitHub Actions references pinned to SHA digests across 3 workflow files. All 8 Docker base image FROM lines pinned by sha256 manifest-list digest. OPA binary download verified by per-architecture SHA256 checksums. Zero mutable @main or @vN tag references remain. Renovate pinDigests configured for automated updates.

### AR-AUTH-01 — Auth endpoints return 429 after configurable rate limit threshold.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S02

In-memory per-IP sliding window rate limiter on /session/exchange-api-key, /saml/exchange-code, and /saml/acs. Configurable threshold (default 10/min) with TTL-based eviction. 12 tests prove threshold enforcement, window reset, IP isolation, eviction, 429+Retry-After response, and fail-open safety.

### AR-AUTH-02 — SAML auth handlers have ≥20 test cases covering all handler paths.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S02

32 SAML tests (25 handler + 7 config) covering SSO initiation, ACS processing, handoff code creation/redemption/expiry, JIT user provisioning, SLO, metadata, disabled SAML, error handling, config enabled/disabled, missing env vars, and cert loading.

### AR-AUTH-03 — Expired sessions and handoff codes automatically cleaned up on configurable interval.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S02

Interval-based cleanup service with batched SQL deletes (default 5-min interval, 1000 batch). 11 tests prove expired row deletion, active session preservation, batch limiting, graceful shutdown, error resilience, and logging.

### AR-INPUT-01 — CSV formula injection sanitized, TypeBox maxLength on all string fields, Elysia body size limit configured.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S03

escapeCSV() neutralizes formula-injection prefixes (=, +, -, @) with single-quote prepend. 47 TypeBox string fields across 7 model files have explicit maxLength constraints (255–500000 tiers). Elysia body size limit configured at 1MB default with structured 413 rejection and MAX_BODY_SIZE env var override. 45 new tests: 21 CSV sanitization, 21 maxLength boundary, 3 body limit.

### AR-INFRA-01 — Docker Compose uses 3 isolated networks, Grafana credentials parameterized, all services have resource limits.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S04

Docker Compose uses 3 isolated networks (frontend, backend, data) with correct per-service assignments. Dashboard isolated from data tier. Grafana credentials parameterized with fail-closed :? syntax. All 9 services (4 app + 3 infra + 2 monitoring) have deploy.resources.limits. Operator guide documents v1.6 network migration with ASCII topology diagram.

### AR-HELM-01 — Helm cert-init Job has full securityContext, sidecar enforces read-only rootfs, ServiceAccount created with RBAC.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S05

Cert-init Job has pod-level and container-level securityContext matching standalone deployments (runAsNonRoot, runAsUser/Group 1000, allowPrivilegeEscalation false, readOnlyRootFilesystem true, capabilities drop ALL, seccompProfile RuntimeDefault). Sidecar template enforces readOnlyRootFilesystem: true with tmpfs for /tmp. ServiceAccount created by default with automountServiceAccountToken: false and namespace-scoped Role granting get/list on secrets and configmaps only. All 6 pod specs reference the dedicated SA.

### AR-TEST-01 — Cross-service integration test validates kernel↔control-plane policy distribution and evidence pipeline.

- Status: validated
- Class: core-capability
- Source: M008 assessment
- Primary Slice: M008/S06

Docker Compose test profile (docker-compose.test.yml) with ephemeral volumes and isolated ports. Integration test orchestration script (scripts/integration-test.sh) with trap-based cleanup and health-wait. Policy distribution test proves kernel subscribes to control-plane gRPC and enforces distributed policies. Evidence pipeline test proves evidence flows from kernel through evidence-collector to ClickHouse and is queryable. All scripts pass bash -n syntax check and shellcheck lint.

### AR-CODE-01 — Dead code removed, production error leaks sanitized, cookie security configurable, ClickHouse warns on empty password, interdict-verify panic-free, test type safety enforced, CSRF posture documented.

- Status: validated
- Class: code-quality
- Source: M008 assessment
- Primary Slice: M008/S07

Dead `document.cookie` httpOnly clearing removed from auth-client.ts. RouteError.tsx console.error sanitized (generic in production, full in development). Cookie `secure` flag decoupled from NODE_ENV via `COOKIE_SECURE` env var. ClickHouse password warns at startup when empty in production. interdict-verify `.unwrap()` replaced with `.unwrap_or_else()` fallback producing valid JSON. `as any` replaced with typed casts in audit-table.test.tsx. CSRF protection posture documented in operator guide. All 7 assessment findings (L-01, L-02, L-03, L-05, L-12, M-01, M-03) addressed.

### AR-PROTO-01 — Proto fields have buf.validate annotations with size constraints, deprecated fields marked, Wasm transfer documented.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S08

buf.validate annotations on all string/bytes fields in evidence.proto and policy_distribution.proto with semantic size limits (IDs 255, names 500, text 1MB, Wasm 16MB). prompt_text/response_text marked deprecated with proto-level `deprecated = true` and comment-level notices. Wasm inline transfer documented with size guidance (>1MB consider shared storage). Vendored protovalidate proto for protoc/tonic compatibility. All 3 assessment findings (L-08, L-10, L-11) addressed.

### AR-CERT-01 — CA validity reduced to 1 year with cert expiry monitoring and documented rotation procedure.

- Status: validated
- Class: security
- Source: M008 assessment
- Primary Slice: M008/S08

CA validity reduced from 10 years to 1 year in both entrypoint.sh and generate-internal-ca.sh. Cert-init emits structured `[certs] WARNING` to stderr when any cert expires within 30 days. Operator guide documents rotation procedure for Docker Compose and Kubernetes with diagnostic commands and production monitoring recommendations. Both assessment findings (L-09, M-08) addressed.

## Deferred

## Out of Scope
