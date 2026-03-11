---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Hardening & Release Readiness
status: complete
stopped_at: Phase 33 executed and verified; v1.4 complete
last_updated: "2026-03-11"
last_activity: 2026-03-11 -- Phase 33 warning cleanup, proto remediation, and project-truth sync verified
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` and `.planning/phases/v1.3-scan-remediation/EXECUTION-ROADMAP.md`

**Core value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model
**Current focus:** v1.4 hardening is complete. The remaining warning debt, Next 16 cleanup, infra lint coverage, and planning/doc truth alignment are all closed.

## Current Position

Milestone v1.2 Trustworthiness & Hardening: COMPLETE (all 9 phases)
Milestone v1.3 Scan Remediation: COMPLETE (all 5 phases)
Milestone v1.4 Hardening & Release Readiness: COMPLETE (all 4 phases)

- Phase 25: Rust Robustness & Async Safety -- COMPLETE
- Phase 26: TypeScript Type Eradication -- COMPLETE
- Phase 27: Auth & Access Control Hardening -- COMPLETE
- Phase 28: Observability & Error Honesty -- COMPLETE
- Phase 29: Deployment Completeness & Config Parity -- COMPLETE
- Phase 30: Secret, Session, and Seed Hardening -- COMPLETE
- Phase 31: Distribution TLS & Evidence Query Scale Hardening -- COMPLETE
- Phase 32: Repo Quality Gates & Infra Lint Coverage -- COMPLETE
- Phase 33: Warning Burn-Down, Next 16 Cleanup & Project Truth -- COMPLETE

## v1.4 Outcomes So Far

1. Seed/bootstrap output no longer includes any plaintext API-key reveal path, including the legacy env toggle branch.
2. The control plane can exchange valid API keys for opaque hashed sessions through a typed endpoint.
3. Dashboard login validates malformed/missing bodies at the boundary and stores only exchanged session tokens in cookies.
4. Kernel distribution mTLS now requires an explicit, deployment-configurable TLS server identity instead of assuming `control-plane`.
5. Review and evidence verification flows now add ClickHouse `event_date` pruning to the remaining high-value `evidence_bundles` reads.
6. Repo-root infra quality commands, CI coverage, and Husky hook docs now cover Docker, shell, Helm, proto, YAML, and honest WSL-backed Rust verification.
7. Control-plane warning debt is reduced to a clean full `bun run check`, dashboard Next 16 warnings are gone, infra lint passes, and active planning docs now match the verified repo state.

## Accumulated Context

### Decisions

v1.2 decisions (archived):
- Evidence signature payload = protobuf-encoded bundle with 6 chain/sig fields zeroed (Phase 16)
- Postgres is single authoritative store for review items; kernel SQLite is local-only (Phase 20)
- 27 route-handler untyped annotations intentionally preserved (Elysia type inference limitation) (Phase 21)
- OPA download isolated into multi-stage Dockerfile for air-gapped cache replacement (Phase 23)
- NetworkPolicy, PDB, HPA disabled by default; opt-in via values.yaml (Phase 24)

v1.3 decisions:
- Release builds now require secure evidence transport (HTTPS + mTLS cert material) instead of relying on implicit trust.
- SQLite review queue access is offloaded via `spawn_blocking` to keep Tokio workers non-blocking.
- Control-plane route handlers use local typed context casts to work around Elysia inference without reverting to `any`.
- Service-to-service review ingest requires authenticated credentials and enforces `user.isService`.
- Deployment verification uses rendered Compose config plus control-plane/dashboard type/test/build gates; Rust verification remains structural on this Windows host.

v1.4 decisions:
- Seed/bootstrap operators now receive principal + key-prefix metadata only; plaintext credential reveal is no longer supported.
- Dashboard login continues to use the BFF + httpOnly cookie architecture, but cookies now store exchanged opaque session tokens instead of raw API keys.
- Control-plane session exchange reuses the existing hashed session storage path rather than introducing a dashboard-specific token type.
- Distribution mTLS server identity is explicit runtime config (`tls_server_name`) and must be set for HTTPS policy distribution.
- Evidence verification uses a two-step bundle fetch plus adjacent-day predecessor window so ClickHouse partition pruning does not break chain checks.

### Blockers/Concerns

- Native Windows Rust compilation remains blocked on this dev machine by the MSVC linker/toolchain layout, but WSL-backed Rust verification is now working again through the explicit `Ubuntu-24.04` wrapper path.
- The local infra toolchain (`hadolint`, `shellcheck`, `yamllint`, `buf`, `helm`) is installed on this host, and the repo infra gate now executes successfully end-to-end.
- Air-gapped build path is documented and health-checked, but not yet demonstrated end-to-end.
- Docker Compose resource limits were added for core Interdict services; infrastructure-side parity can be tightened further if needed.

## Session Continuity

**Last session:** 2026-03-11
**Stopped at:** v1.4 complete and verified after Phase 33 closure and gap remediation
**Next action:** Choose the next milestone beyond v1.4 or cut a release from the now-clean repo state
