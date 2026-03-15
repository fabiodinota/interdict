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

## Deferred

## Out of Scope
