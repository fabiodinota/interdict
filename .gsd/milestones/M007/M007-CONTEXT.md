# M007: Production Readiness (v1.5) — Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

## Project Description

Interdict.io is a kernel-level AI governance and compliance platform. v1.2 shipped all functional requirements. M003–M006 addressed trustworthiness, scan remediation, hardening, and production safety. This milestone closes every remaining gap, concern, advisory, weakness, and risk identified in the comprehensive 2026-03-14 multi-agent deep audit. No new product features — this is a pure hardening and operational maturity milestone.

## Why This Milestone

The 2026-03-14 assessment confirmed that Interdict's architecture and Rust code quality are A+, but identified meaningful gaps in:

- Hot-path test coverage (relay code with zero tests)
- Release automation (no CI/CD pipeline for image publishing)
- Operational tooling (no E2E tests, no secret scanning, no monitoring)
- Dashboard accessibility and CSP hardening
- Documentation for operators

These gaps must be closed before scaling beyond the current two-partner pilot and before any GA release. Total distinct action items: ~45, organized into 8 slices across 3 priority tiers.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Deploy with confidence that all critical code paths (relay, streaming, TLS, queue, signing) have ≥80% test coverage
- Push a version tag and get automatically-built, signed container images published to ghcr.io
- Run `docker compose --profile monitoring up` to get a full monitoring stack
- Follow operator documentation to deploy, troubleshoot, rotate certs, and recover from failures
- Use a dashboard that meets WCAG AA accessibility standards with nonce-based CSP
- Run a full E2E smoke test that validates the entire stack end-to-end

### Entry point / environment

- Entry point: `cargo test --workspace`, `docker compose up`, CI pipeline, Helm chart
- Environment: local dev (Windows + WSL), CI (GitHub Actions), Docker, Kubernetes
- Live dependencies involved: ghcr.io (image publishing), GitHub Actions (CI/CD)

## Completion Class

- Contract complete means: all Rust/TS modules hit coverage targets; all CI gates pass; all documentation exists and is accurate
- Integration complete means: tag push produces signed images in ghcr.io; E2E smoke test passes; Helm chart passes kube-score
- Operational complete means: operator runbook covers all known failure modes; monitoring stack is functional; backup procedures are scripted

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `cargo test --workspace --all-targets` passes with ≥80% coverage on all previously-untested hot-path modules
- Tag push `v1.5.0` produces signed container images in ghcr.io with SBOM and provenance
- `npx axe-cli http://localhost:3001 --exit` returns zero critical/serious WCAG violations
- E2E smoke test script spins up full stack, runs integration checks, and tears down cleanly
- Operator guide, API docs, and troubleshooting guide exist and cover all known failure modes
- All assessment grades improved: Test Coverage A-, CI/CD A, DevOps A, Dashboard A

## Risks and Unknowns

- Relay test complexity — proxy/relay.rs involves bidirectional async I/O with cross-chunk pattern detection; mocking may be non-trivial
- KMS signing mock fidelity — AWS KMS mock must faithfully simulate throttling and error modes
- CSP nonce integration — Next.js nonce propagation may interact unexpectedly with third-party components
- E2E test stability — full-stack docker-compose smoke tests can be flaky across environments
- Playwright setup — dashboard E2E tests require browser automation infrastructure in CI

## Existing Codebase / Prior Art

- `crates/kernel/src/proxy/relay.rs` (~730 lines) — zero tests, critical hot path
- `crates/kernel/src/proxy/streaming_relay.rs` (~480 lines) — zero tests, evidence collection path
- `crates/kernel/src/proxy/tls.rs` — TLS connection management
- `crates/kernel/src/policy/layer3/queue.rs` (~350 lines) — review queue persistence
- `crates/kernel/src/policy/layer3/store.rs` — SQLite store for review items
- `crates/evidence-collector/src/signing/` — local, KMS, and rotation signing providers
- `crates/evidence-collector/src/chain/` — chain signer and manager
- `dashboard/` — Next.js dashboard, ~50 components, 9 currently tested
- `control-plane/` — Bun/Elysia API, ~27 modules, 18 currently tested
- `.github/workflows/ci-quality-security.yml` — existing CI pipeline
- `helm/interdict/` — Helm chart
- `docker-compose.yml` — Docker Compose deployment
- `docker/` — Dockerfiles for all services

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- PR-TEST-01 — Hot-path relay modules reach ≥80% test coverage
- PR-TEST-02 — Layer 3 queue and evidence signing modules reach ≥80% test coverage
- PR-TEST-03 — Dashboard component coverage expands from 9 to 40+ components
- PR-TEST-04 — E2E smoke test validates full stack
- PR-CICD-01 — Automated release pipeline with signed images
- PR-SEC-01 — CSP nonce-based, no unsafe-inline
- PR-SEC-02 — Network policies enabled by default in Helm
- PR-SEC-03 — Secret scanning blocks PRs
- PR-OPS-01 — Operator guide, API docs, troubleshooting guide
- PR-OPS-02 — Docker improvements (dockerignore, multi-platform)
- PR-OPS-03 — Monitoring stack, backup procedures, environment validation
- PR-A11Y-01 — Dashboard meets WCAG AA

## Scope

### In Scope

- Unit and integration tests for all untested hot-path Rust modules
- Unit tests for Layer 3 queue, store, and evidence signing providers
- Expanded test coverage for control-plane and dashboard
- E2E test suite with Playwright and docker-compose smoke tests
- CI/CD release pipeline with signed images, SBOM, and provenance
- Conventional commits, semantic versioning, changelog automation
- Secret scanning and performance regression gates in CI
- CSP nonce hardening for dashboard
- Helm network policy enablement
- Docker improvements (dockerignore, multi-platform, logging)
- Monitoring stack (Prometheus + Grafana) as docker-compose profile
- Operator guide, API docs, troubleshooting guide
- Dashboard WCAG AA accessibility
- Removal of unused Rust and TypeScript dependencies
- ProxyService::new() constructor safety documentation and runtime warnings

### Out of Scope / Non-Goals

- New product features or capabilities
- Architecture changes
- Performance optimization beyond regression gates
- New regulatory framework packs
- OIDC authentication
- Kubernetes Operator
- Dark mode

## Technical Constraints

- Rust edition 2024, MSRV supporting std::sync::LazyLock
- Must not break existing 350+ test suite
- Docker changes must preserve multi-stage build optimization
- Dashboard changes must preserve Next.js SSR capability
- CI changes must not significantly increase pipeline duration

## Integration Points

- GitHub Actions CI — new release, secret scanning, benchmark, and coverage steps
- ghcr.io — container image registry for release pipeline
- cosign — image signing for SLSA provenance
- Playwright — browser automation for E2E testing
- axe-core — accessibility validation
- kube-score — Helm chart validation
- Prometheus + Grafana — monitoring stack
