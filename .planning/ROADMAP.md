# Roadmap: Interdict.io

## Overview

Interdict.io is an AI governance kernel for regulated enterprises. v1.0 shipped the data plane and control plane API. v1.1 made it deployable and usable with identity, dashboard, and deployment packaging. v1.2 closed the gap between claims and provable behavior. v1.3 remediates all findings from a comprehensive codebase scan. v1.4 focuses on the remaining hardening work: secret/session handling, deployment-flexible mTLS, evidence query scale, repo-wide quality gates, and codebase truth cleanup. v1.5 closes every gap identified in the 2026-03-14 multi-agent deep audit: hot-path test coverage, release automation, security hardening, DevOps maturity, and operator documentation.

## Milestones

- **v1.0 MVP** -- Phases 1-6.1 (shipped 2026-03-01)
- **v1.1 Pilot Ready** -- Phases 7-15 (shipped 2026-03-04)
- **v1.2 Trustworthiness & Hardening** -- Phases 16-24 (completed 2026-03-10)
- **v1.3 Scan Remediation** -- Phases 25-29 (completed 2026-03-11)
- **v1.4 Hardening & Release Readiness** -- Phases 30-33 (completed 2026-03-11)
- **v1.5 Production Readiness** -- Phases 34-41 (planning)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6.1) -- SHIPPED 2026-03-01</summary>

- [x] Phase 1: Kernel Proxy Foundation (3/3 plans) -- completed 2026-02-26
- [x] Phase 2: Policy Engine (4/4 plans) -- completed 2026-02-26
- [x] Phase 3: PII Detection & Content Inspection (6/6 plans) -- completed 2026-02-27
- [x] Phase 4: Evidence Collector (4/4 plans) -- completed 2026-02-28
- [x] Phase 5: Control Plane API Core (6/6 plans) -- completed 2026-02-28
- [x] Phase 6: Policy Distribution & Kernel Integration (4/4 plans) -- completed 2026-03-01
- [x] Phase 6.1: Kernel Integration Wiring (1/1 plan, INSERTED) -- completed 2026-03-01

Full details archived in `milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v1.1 Pilot Ready (Phases 7-15) -- SHIPPED 2026-03-04</summary>

- [x] Phase 7: Identity Foundation (3/3 plans) -- completed 2026-03-01
- [x] Phase 8: Container Images & Docker Compose (2/2 plans) -- completed 2026-03-02
- [x] Phase 9: Dashboard Core Views (5/5 plans) -- completed 2026-03-03
- [x] Phase 10: SAML SSO & Security Hardening (3/3 plans) -- completed 2026-03-03
- [x] Phase 11: Advanced Dashboard Views (4/4 plans) -- completed 2026-03-03
- [x] Phase 12: Kubernetes Deployment (3/3 plans) -- completed 2026-03-03
- [x] Phase 13: Deployment Wiring for SAML & Key Rotation (2/2 plans) -- completed 2026-03-03
- [x] Phase 14: SAML SSO Cross-Origin Cookie Fix (1/1 plan) -- completed 2026-03-04
- [x] Phase 15: Signing Key Management Dashboard UI (1/1 plan) -- completed 2026-03-04

Full details archived in `milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>v1.2 Trustworthiness & Hardening (Phases 16-24) -- COMPLETED 2026-03-10</summary>

- [x] Phase 16: Evidence Verification Truth -- completed 2026-03-10 (9bf2b24)
- [x] Phase 17: Auth Secret Hardening and JS Gates -- completed 2026-03-10 (30bdf0b)
- [x] Phase 18: Reporting Integrity and Scope Truth -- completed 2026-03-10 (c9e2ba5)
- [x] Phase 19: Identity Attribution and Durable Evidence Delivery -- completed 2026-03-10 (0d190c3)
- [x] Phase 20: Review Workflow Consolidation -- completed 2026-03-10 (bdd762c)
- [x] Phase 21: Kernel and Control Plane Maintainability -- completed 2026-03-10 (770a0d3)
- [x] Phase 22: Dashboard Reliability and Operator Trust -- completed 2026-03-10 (8caad88)
- [x] Phase 23: Deployment Truth and Artifact Hardening -- completed 2026-03-10 (03785bd)
- [x] Phase 24: Platform Hardening and Release Gate -- completed 2026-03-10

Full details in `.planning/milestones/v1.2-EXECUTION-ROADMAP.md`

</details>

<details>
<summary>v1.3 Scan Remediation (Phases 25-29) -- COMPLETED 2026-03-11</summary>

- [x] Phase 25: Rust Robustness & Async Safety -- completed 2026-03-11
- [x] Phase 26: TypeScript Type Eradication -- completed 2026-03-11
- [x] Phase 27: Auth & Access Control Hardening -- completed 2026-03-11
- [x] Phase 28: Observability & Error Honesty -- completed 2026-03-11
- [x] Phase 29: Deployment Completeness & Config Parity -- completed 2026-03-11

Full details in `.planning/milestones/v1.3-EXECUTION-ROADMAP.md`
Scan report: `.planning/milestones/v1.3-SCAN-REPORT.md`

</details>

<details>
<summary>v1.4 Hardening & Release Readiness (Phases 30-33) -- COMPLETED 2026-03-11</summary>

- [x] Phase 30: Secret, Session, and Seed Hardening -- completed and verified 2026-03-11 (3/3 plans)
- [x] Phase 31: Distribution TLS & Evidence Query Scale Hardening -- completed and verified 2026-03-11 (2/2 plans)
- [x] Phase 32: Repo Quality Gates & Infra Lint Coverage -- completed and verified 2026-03-11 (3/3 plans)
- [x] Phase 33: Warning Burn-Down, Next 16 Cleanup & Project Truth -- completed and verified 2026-03-11 (5/5 plans)

Execution roadmap: `.planning/milestones/v1.4-EXECUTION-ROADMAP.md`

</details>

<details>
<summary>v1.5 Production Readiness (Phases 34-41) -- PLANNING</summary>

- [ ] Phase 34: Hot-Path Relay Testing
- [ ] Phase 35: Layer 3 Queue + Evidence Signing Tests
- [ ] Phase 36: Dependency Cleanup + Constructor Safety
- [ ] Phase 37: Expanded Test Coverage
- [ ] Phase 38: CI/CD Release Pipeline + Quality Gates
- [ ] Phase 39: Security & CSP Hardening
- [ ] Phase 40: DevOps & Deployment Maturity
- [ ] Phase 41: Documentation, Accessibility & Polish

Execution roadmap: `.planning/milestones/v1.5-EXECUTION-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6.1 | v1.0 | 28/28 | Complete | 2026-03-01 |
| 7-15 | v1.1 | 24/24 | Complete | 2026-03-04 |
| 16-24 | v1.2 | 9/9 phases | Complete | 2026-03-10 |
| 25-29 | v1.3 | 5/5 phases | Complete | 2026-03-11 |
| 30-33 | v1.4 | 4/4 phases | Complete | 2026-03-11 |
| 34-41 | v1.5 | 0/8 phases | Planning | — |

## Planned Next Phases

### Phase 30: Secret, Session, and Seed Hardening

**Goal:** Remove plaintext secret exposure paths and harden dashboard auth/session handling without changing the BFF architecture.
**Requirements:** [HR-SEC-01, HR-AUTH-01, HR-AUTH-02]
**Plans:** 3 plans

Plans:
- [x] `30-01-PLAN.md` -- Remove plaintext seed key reveal output and add regression coverage.
- [x] `30-02-PLAN.md` -- Add control-plane API-key-to-session exchange contract and tests.
- [x] `30-03-PLAN.md` -- Update dashboard login/me/logout to use validated opaque sessions.

### Phase 31: Distribution TLS & Evidence Query Scale Hardening

**Goal:** Make kernel distribution TLS deployment-flexible and ensure large evidence queries stay partition-safe in ClickHouse.
**Requirements:** [HR-DIST-01, HR-EVID-01]
**Plans:** 2 plans

Plans:
- [x] `31-01-PLAN.md` -- Make kernel distribution TLS server identity explicit and deployment-configurable.
- [x] `31-02-PLAN.md` -- Add partition-safe ClickHouse date bounds to review and evidence verification queries.

### Phase 32: Repo Quality Gates & Infra Lint Coverage

**Goal:** Extend formatter, linter, hook, and CI coverage to deployment and infra artifacts, not just app code.
**Requirements:** [HR-OPS-01, HR-OPS-02]
**Plans:** 3 plans

Plans:
- [x] `32-01-PLAN.md` -- Create the canonical repo-root infra lint and WSL Rust verification command layer.
- [x] `32-02-PLAN.md` -- Add a dedicated CI infra-quality job that installs and runs the repo infra gate.
- [x] `32-03-PLAN.md` -- Consolidate Husky/local hook docs around staged infra checks and WSL-backed Rust validation.

### Phase 33: Warning Burn-Down, Next 16 Cleanup & Project Truth

**Goal:** Reduce remaining warning debt, complete framework cleanup, and align planning docs with actual verified repo state.
**Requirements:** [HR-MAINT-01, HR-DOC-01]
**Plans:** 5 plans

Plans:
- [x] `33-01-PLAN.md` -- Burn down the current control-plane production and hotspot test warnings.
- [x] `33-02-PLAN.md` -- Finish Next 16 proxy/root cleanup and reduce the two dashboard table warnings.
- [x] `33-03-PLAN.md` -- Resolve remaining Dockerfile warning debt and align active planning docs/local config with repo truth.
- [x] `33-04-PLAN.md` -- Normalize the remaining control-plane repo-wide format drift so `bun run check` passes.
- [x] `33-05-PLAN.md` -- Rename the evidence and policy distribution protos to close the Buf naming gap cleanly.

### Phase 34: Hot-Path Relay Testing

**Goal:** Bring proxy relay and streaming relay from 0% to ≥80% test coverage with meaningful unit and integration tests.
**Requirements:** [PR-TEST-01]
**Plans:** 4 plans

Plans:
- [ ] `34-01-PLAN.md` -- Unit tests for proxy/relay.rs (bidirectional relay, cross-chunk, timeout, error paths)
- [ ] `34-02-PLAN.md` -- Unit tests for proxy/streaming_relay.rs (streaming copy, evidence callback, backpressure)
- [ ] `34-03-PLAN.md` -- Unit tests for proxy/tls.rs (TLS establishment, handshake failure, mTLS, cert validation)
- [ ] `34-04-PLAN.md` -- Integration test: full proxy relay flow with mock upstream

### Phase 35: Layer 3 Queue + Evidence Signing Tests

**Goal:** Cover human review queue persistence and evidence signing providers with comprehensive tests.
**Requirements:** [PR-TEST-02]
**Plans:** 4 plans

Plans:
- [ ] `35-01-PLAN.md` -- Unit tests for policy/layer3/queue.rs (FIFO, capacity, concurrency, overflow, shutdown)
- [ ] `35-02-PLAN.md` -- Unit tests for policy/layer3/store.rs (SQLite CRUD, atomicity, recovery, cleanup)
- [ ] `35-03-PLAN.md` -- Unit tests for evidence-collector signing providers (local, KMS mock, rotation)
- [ ] `35-04-PLAN.md` -- Unit tests for chain/signer.rs and chain/mod.rs (chain integrity, concurrent bundles)

### Phase 36: Dependency Cleanup + Constructor Safety

**Goal:** Remove all unused dependencies and document/guard the dangerous ProxyService::new() constructor.
**Requirements:** [PR-HYGIENE-01, SEC-01]
**Plans:** 3 plans

Plans:
- [ ] `36-01-PLAN.md` -- Remove unused Rust dependencies (tower-http, verify uuid)
- [ ] `36-02-PLAN.md` -- Remove unused TypeScript dependencies (@sinclair/typebox, drizzle-typebox)
- [ ] `36-03-PLAN.md` -- Guard ProxyService::new() with danger-doc, startup warning, and enforcing constructor

### Phase 37: Expanded Test Coverage

**Goal:** Fill remaining test gaps across Rust, TypeScript control-plane, and dashboard. Add E2E suite.
**Requirements:** [PR-TEST-03, PR-TEST-04, PR-TEST-05]
**Plans:** 7 plans

Plans:
- [ ] `37-01-PLAN.md` -- Remaining Rust module tests (bootstrap, request_id, distribution, evidence edge cases)
- [ ] `37-02-PLAN.md` -- TypeScript control-plane test expansion (anomalies, SAML, audit, reports, models)
- [ ] `37-03-PLAN.md` -- Dashboard component test expansion (40+ components, interaction + accessibility testing)
- [ ] `37-04-PLAN.md` -- Fix existing TypeScript test errors (framework-list, policy-list)
- [ ] `37-05-PLAN.md` -- Negative and adversarial testing across all services
- [ ] `37-06-PLAN.md` -- E2E test suite (Playwright + docker-compose smoke + air-gapped validation)
- [ ] `37-07-PLAN.md` -- Coverage thresholds as hard CI gates

### Phase 38: CI/CD Release Pipeline + Quality Gates

**Goal:** Automate the entire release process and strengthen CI quality gates.
**Requirements:** [PR-CICD-01, PR-CICD-02, PR-CICD-03]
**Plans:** 6 plans

Plans:
- [ ] `38-01-PLAN.md` -- Release workflow (ghcr.io push, tagging, SBOM, cosign, GitHub Releases)
- [ ] `38-02-PLAN.md` -- Semantic versioning + conventional commits (commitlint, changelog automation)
- [ ] `38-03-PLAN.md` -- Make cargo-audit blocking + add secret scanning to CI
- [ ] `38-04-PLAN.md` -- Performance regression gates (Criterion benchmarks with thresholds)
- [ ] `38-05-PLAN.md` -- CODEOWNERS + PR template
- [ ] `38-06-PLAN.md` -- Multi-platform Docker builds (linux/amd64, linux/arm64)

### Phase 39: Security & CSP Hardening

**Goal:** Close all security advisories and harden remaining attack surface.
**Requirements:** [SEC-02, SEC-03, PR-SEC-01, PR-SEC-02]
**Plans:** 3 plans

Plans:
- [ ] `39-01-PLAN.md` -- Replace CSP unsafe-inline with nonce-based approach
- [ ] `39-02-PLAN.md` -- Enable Helm network policies by default + validate
- [ ] `39-03-PLAN.md` -- Document full_text_storage risks (SEC-02, SEC-03) + add startup warning

### Phase 40: DevOps & Deployment Maturity

**Goal:** Harden Docker, Helm, and Docker Compose for production-grade operation.
**Requirements:** [PR-OPS-01, PR-OPS-02, PR-OPS-03]
**Plans:** 4 plans

Plans:
- [ ] `40-01-PLAN.md` -- Docker improvements (.dockerignore, image size validation)
- [ ] `40-02-PLAN.md` -- Helm/Kubernetes improvements (cert-manager, backup jobs, kube-score)
- [ ] `40-03-PLAN.md` -- Docker Compose improvements (logging, monitoring stack, backup scripts)
- [ ] `40-04-PLAN.md` -- Environment validation script

### Phase 41: Documentation, Accessibility & Polish

**Goal:** Complete all documentation gaps and bring dashboard accessibility to WCAG AA.
**Requirements:** [PR-DOC-01, PR-DOC-02, PR-A11Y-01]
**Plans:** 5 plans

Plans:
- [ ] `41-01-PLAN.md` -- Deployment runbook / operator guide
- [ ] `41-02-PLAN.md` -- API documentation (OpenAPI + gRPC docs)
- [ ] `41-03-PLAN.md` -- Troubleshooting guide
- [ ] `41-04-PLAN.md` -- Dashboard accessibility improvements (ARIA, keyboard nav, live regions, WCAG AA)
- [ ] `41-05-PLAN.md` -- Update project state, assessment scores, and milestone docs

---
*Roadmap created: 2026-02-26*
*Last updated: 2026-03-14 -- v1.5 production readiness milestone planned (8 phases, 36 plans)*
