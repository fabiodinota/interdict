# Requirements

## Active

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

## Deferred

## Out of Scope
