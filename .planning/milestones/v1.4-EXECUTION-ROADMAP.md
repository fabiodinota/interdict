# v1.4 Hardening & Release Readiness -- Phased Execution Roadmap

**Status:** planning
**Created:** 2026-03-11
**Scope:** close the remaining post-v1.3 security, scale, infra-quality, and codebase-truth gaps identified in the latest full-codebase assessment.

## Why This Milestone Exists

The codebase now has real verification gates across Rust, the control-plane, and the dashboard, but a focused post-verification assessment still found a small number of high-risk and medium-risk gaps that matter for production readiness.

This milestone is a hardening milestone. No new product features.

## Hard Ordering Rules

1. Phase 30 removes secret/session exposure risks first.
2. Phase 31 can proceed once Phase 30 direction is stable, but should not weaken the Phase 30 auth model.
3. Phase 32 comes after the app/runtime hardening direction is settled so new quality gates match the chosen workflows.
4. Phase 33 is last; it burns down warning debt and updates project truth after the hardening work lands.

## Phase Summary

| Phase | Name | Primary Goal | Depends On | Focus |
| --- | --- | --- | --- | --- |
| 30 | Secret, Session, and Seed Hardening | Remove plaintext secret exposure and harden dashboard session/auth boundaries | none | Security-critical |
| 31 | Distribution TLS & Evidence Query Scale Hardening | Remove hard-coded control-plane TLS naming and make evidence queries partition-safe | 30 | Security + scale |
| 32 | Repo Quality Gates & Infra Lint Coverage | Extend formatter/linter/hook/CI coverage to infra and deployment surfaces | 30-31 | Process hardening |
| 33 | Warning Burn-Down, Next 16 Cleanup & Project Truth | Reduce remaining warnings, finish Next 16 cleanup, and sync docs/state with reality | 30-32 | Maintainability |

---

## Phase 30: Secret, Session, and Seed Hardening

**Goal:** No plaintext API key reveal path in seeding, no auth-sensitive request parsing without schema validation, and no dashboard session model that persists raw API keys by default.

### Focus Areas

- Remove the `SEED_SHOW_KEYS=true` plaintext reveal path from the control-plane seed flow.
- Harden the dashboard login API boundary with typed input validation.
- Replace or tightly constrain the dashboard's current raw-API-key cookie session model.
- Preserve the existing BFF + httpOnly-cookie architecture; do not move bearer credentials into client-side storage.

### Exit Criteria

- No code path intentionally prints generated API keys to logs/stdout.
- Dashboard login request bodies are schema-validated at the route boundary.
- Dashboard auth/session cookies do not persist raw API keys as the long-term session primitive.
- Auth/login tests cover valid, invalid, and malformed request cases.

---

## Phase 31: Distribution TLS & Evidence Query Scale Hardening

**Goal:** No hard-coded mTLS server name in kernel distribution and no large evidence queries that bypass ClickHouse partition pruning.

### Focus Areas

- Make the kernel distribution TLS server name configurable from deployment/runtime config.
- Add `event_date` filters to evidence and review flows querying `evidence_bundles`.
- Verify the query shapes stay compatible with existing verification and reconciliation flows.

### Exit Criteria

- Kernel distribution client does not hard-code `control-plane` as the TLS server name.
- Large ClickHouse reads on `evidence_bundles` include partition-friendly date filters.
- Targeted tests cover config wiring and query behavior.

---

## Phase 32: Repo Quality Gates & Infra Lint Coverage

**Goal:** App code, infra code, and deployment artifacts all have consistent local and CI quality gates.

### Focus Areas

- Add lint/validation for Dockerfiles, Helm charts, proto definitions, shell scripts, and YAML.
- Tighten local hook workflows without breaking the Windows + WSL Rust workflow.
- Ensure CI enforces the same infra-quality checks it expects locally.

### Exit Criteria

- Repo has explicit tooling coverage for Docker, Helm, shell, proto, and YAML.
- CI runs those checks.
- Local hooks/scripts clearly document or automate how Rust verification runs on this host.

---

## Phase 33: Warning Burn-Down, Next 16 Cleanup & Project Truth

**Goal:** Reduce remaining warning debt, remove stale framework/workflow warnings, and align planning docs with actual verified state.

### Focus Areas

- Reduce remaining Biome and dashboard lint warnings, prioritizing production code.
- Finish Next 16 cleanup (`middleware` -> `proxy`, Turbopack root, related warnings).
- Update `.planning/STATE.md`, `.planning/ROADMAP.md`, and related docs to reflect actual commits and WSL-based Rust verification.
- Remove tracked local-only config from version control.

### Exit Criteria

- Warning counts materially reduced and documented where intentionally accepted.
- Next.js build warnings related to deprecated conventions are resolved.
- Planning/state docs describe the current repo truth, not the pre-verification state.
