# M007: Production Readiness (v1.5)

**Vision:** Close every gap, concern, advisory, weakness, and risk identified in the 2026-03-14 multi-agent deep audit — bringing test coverage, CI/CD, security, DevOps, and documentation to A-grade across the board before GA release.

## Success Criteria

- Hot-path relay modules (relay.rs, streaming_relay.rs, tls.rs) have ≥80% line coverage with meaningful unit and integration tests
- Layer 3 queue/store and all evidence signing providers (local, KMS, rotation, chain) are fully tested
- Dashboard component test coverage expands from 9 to 40+ components with interaction and accessibility assertions
- Control-plane module coverage expands from 18 to 27+ tested modules
- E2E smoke test validates full stack startup, user workflow, and teardown
- Tag push produces signed container images in ghcr.io with SBOM and SLSA provenance
- cargo-audit is a blocking CI gate (not continue-on-error)
- Secret scanning runs on every PR and blocks on detection
- CSP uses nonce-based policy — zero `unsafe-inline` in script-src or style-src
- Helm network policies enabled by default
- Operator guide, API documentation, and troubleshooting guide exist and are complete
- Dashboard passes axe-core with zero critical/serious WCAG violations
- All unused Rust and TypeScript dependencies removed
- Coverage thresholds enforced as hard CI gates (project 70%, patch 80%)

## Key Risks / Unknowns

- Relay test complexity — bidirectional async I/O with cross-chunk pattern detection requires careful mock design
- KMS signing mock fidelity — must simulate throttling, errors, and algorithm constraints
- CSP nonce + Next.js — nonce propagation through SSR may need custom middleware
- E2E flakiness — full-stack docker-compose tests may be timing-sensitive across environments
- Playwright CI — browser automation requires headless Chrome in GitHub Actions

## Proof Strategy

- Relay test complexity → retire in S01 by proving T01 (relay.rs unit tests) passes with ≥80% coverage using mock async streams
- KMS mock fidelity → retire in S02 by proving T03 (signing providers) handles KMS throttling/error in tests
- CSP nonce + Next.js → retire in S06 by proving dashboard renders with strict CSP and zero console violations
- E2E flakiness → retire in S04 by proving T06 (E2E suite) passes 3 consecutive runs in CI
- Playwright CI → retire in S04 by proving Playwright runs in GitHub Actions headless mode

## Verification Classes

- Contract verification: `cargo test --workspace --all-targets`, `bun test`, `npx vitest run`, `npx playwright test`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --all -- --check`
- Integration verification: tag push → ghcr.io images, E2E smoke test, Helm template → kube-score, docker-compose monitoring profile
- Operational verification: operator runbook accuracy, backup script execution, environment validation script
- UAT / human verification: dashboard accessibility with screen reader, operator guide review by someone unfamiliar with project

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 8 slices are complete with passing verification
- `cargo test --workspace --all-targets` passes with ≥80% coverage on all previously-untested hot-path modules
- Tag push produces signed images in ghcr.io
- E2E smoke test passes in CI
- Dashboard passes axe-core with zero critical/serious violations
- Operator guide, API docs, and troubleshooting guide exist
- All assessment grades show improvement: Test Coverage A-, CI/CD A, DevOps A, Dashboard A
- No security advisory remains unaddressed

## Requirement Coverage

- Covers: PR-TEST-01, PR-TEST-02, PR-TEST-03, PR-TEST-04, PR-CICD-01, PR-SEC-01, PR-SEC-02, PR-SEC-03, PR-OPS-01, PR-OPS-02, PR-OPS-03, PR-A11Y-01
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: Hot-Path Relay Testing** `risk:high` `depends:[]`
  > After this: proxy/relay.rs, proxy/streaming_relay.rs, and proxy/tls.rs have ≥80% line coverage with unit tests covering bidirectional relay, cross-chunk pattern detection, connection failure handling, and evidence collection. Integration test proves full proxy relay flow end-to-end. `cargo test -p kernel relay streaming_relay tls --nocapture` passes.
- [ ] **S02: Layer 3 Queue + Evidence Signing Tests** `risk:high` `depends:[]`
  > After this: Layer 3 queue/store modules and all evidence signing providers (local Ed25519, KMS mock, key rotation, chain management) are fully tested. `cargo test -p kernel queue store && cargo test -p evidence-collector signing chain` passes with ≥80% coverage.
- [ ] **S03: Dependency Cleanup + Constructor Safety** `risk:low` `depends:[]`
  > After this: All 4 unused dependencies removed (tower-http, uuid if unused, @sinclair/typebox, drizzle-typebox). ProxyService::new() has danger-doc, runtime warning, and per-request logging when pipeline is None. `cargo build --workspace && bun install && bun test` pass with fewer dependencies.
- [ ] **S04: Expanded Test Coverage** `risk:medium` `depends:[S01,S02]`
  > After this: Dashboard coverage expands from 9→40+ components, control-plane from 18→27+ modules, negative/adversarial tests cover all services, E2E smoke test (Playwright + docker-compose) passes in CI, and coverage thresholds are enforced as hard CI gates.
- [ ] **S05: CI/CD Release Pipeline + Quality Gates** `risk:medium` `depends:[]`
  > After this: Tag push produces signed container images in ghcr.io with SBOM and SLSA provenance. Conventional commits enforced, changelog auto-generated, cargo-audit blocks PRs, secret scanning runs on every PR, performance benchmarks have regression gates, and CODEOWNERS routes reviews.
- [ ] **S06: Security & CSP Hardening** `risk:medium` `depends:[S05]`
  > After this: Dashboard CSP uses nonces instead of unsafe-inline. Helm network policies enabled by default. full_text_storage risks documented for operators with startup warning. No security advisory remains unaddressed.
- [ ] **S07: DevOps & Deployment Maturity** `risk:medium` `depends:[S05]`
  > After this: All Docker images build for amd64+arm64 with proper .dockerignore. Helm chart passes kube-score. Docker Compose has logging rotation, optional monitoring profile (Prometheus+Grafana), backup scripts, and environment validation prevents misconfiguration at startup.
- [ ] **S08: Documentation, Accessibility & Polish** `risk:low` `depends:[S01,S02,S03,S04,S05,S06,S07]`
  > After this: Operator guide, API docs (OpenAPI + gRPC), and troubleshooting guide exist. Dashboard passes axe-core with zero critical/serious WCAG violations. All project tracking documents updated to reflect v1.5 status.

## Boundary Map

### S01 → S04

Produces:
- Established test patterns for async relay mocking (mock upstream servers, connection simulation)
- Proven relay code paths that expanded tests in S04 can reference and extend

Consumes:
- nothing (first slice, no dependencies)

### S02 → S04

Produces:
- Established test patterns for evidence signing mocks (KMS client mock, key rotation simulation)
- Proven queue/store test fixtures that S04 negative testing can build on

Consumes:
- nothing (first slice, no dependencies)

### S03

Produces:
- Cleaner dependency tree (fewer unused crates/packages)
- ProxyService safety documentation and runtime warnings

Consumes:
- nothing (independent slice)

### S04 → S08

Produces:
- Comprehensive test coverage across all services (baseline for documentation accuracy verification)
- E2E smoke test that validates the stack S08 will document

Consumes:
- S01 relay test patterns
- S02 signing test patterns

### S05 → S06

Produces:
- CI pipeline infrastructure that secret scanning and security gates integrate into
- Release workflow that security hardening changes will flow through

Consumes:
- nothing (independent of S01-S03)

### S05 → S07

Produces:
- Release workflow for publishing multi-platform Docker images
- CI pipeline that kube-score and Helm validation integrate into

Consumes:
- nothing (independent of S01-S03)

### S06

Produces:
- CSP-hardened dashboard (nonce-based)
- Network-policy-enabled Helm chart
- full_text_storage operator documentation

Consumes:
- S05 CI pipeline for secret scanning integration

### S07

Produces:
- Production-grade Docker/Compose/Helm configurations
- Monitoring stack, backup scripts, environment validation

Consumes:
- S05 release pipeline for image registry work

### S08

Produces:
- Complete operator documentation suite
- WCAG AA-compliant dashboard
- Updated project state reflecting v1.5 completion

Consumes:
- All prior slices (documents the final state after all changes land)
