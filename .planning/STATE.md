---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Hardening & Release Readiness
status: in_progress
stopped_at: Phase 30 executed and verified in working tree
last_updated: "2026-03-11"
last_activity: 2026-03-11 -- Phase 30 secret/session/seed hardening verified in working tree
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 25
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` and `.planning/phases/v1.3-scan-remediation/EXECUTION-ROADMAP.md`

**Core value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model
**Current focus:** v1.4 hardening in progress. Phase 30 is complete in the working tree and Phase 31 is next.

## Current Position

Milestone v1.2 Trustworthiness & Hardening: COMPLETE (all 9 phases)
Milestone v1.3 Scan Remediation: COMPLETE (all 5 phases)
Milestone v1.4 Hardening & Release Readiness: IN PROGRESS (4 phases)

- Phase 25: Rust Robustness & Async Safety -- COMPLETE (working tree)
- Phase 26: TypeScript Type Eradication -- COMPLETE (working tree)
- Phase 27: Auth & Access Control Hardening -- COMPLETE (working tree)
- Phase 28: Observability & Error Honesty -- COMPLETE (working tree)
- Phase 29: Deployment Completeness & Config Parity -- COMPLETE (working tree)
- Phase 30: Secret, Session, and Seed Hardening -- COMPLETE (working tree)

## v1.4 Outcomes So Far

1. Seed/bootstrap output no longer includes any plaintext API-key reveal path, including the legacy env toggle branch.
2. The control plane can exchange valid API keys for opaque hashed sessions through a typed endpoint.
3. Dashboard login validates malformed/missing bodies at the boundary and stores only exchanged session tokens in cookies.

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

### Blockers/Concerns

- Rust compilation remains blocked on this Windows dev machine (missing `dlltool.exe` / broken MSVC linker). Rust changes were formatted and verified structurally, but `cargo check` still cannot complete.
- Air-gapped build path is documented and health-checked, but not yet demonstrated end-to-end.
- Docker Compose resource limits were added for core Interdict services; infrastructure-side parity can be tightened further if needed.

## Session Continuity

**Last session:** 2026-03-11
**Stopped at:** Phase 30 complete in working tree, verification passed for control-plane and dashboard auth hardening
**Next action:** Plan and execute Phase 31
