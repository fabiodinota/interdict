---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Pilot Ready
status: in-progress
stopped_at: Completed 10-03 (Ed25519 Signing Key Rotation) -- Phase 10 fully complete
last_updated: "2026-03-03T18:47:00Z"
last_activity: 2026-03-03 -- Completed 10-03 (Ed25519 Signing Key Rotation)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model
**Current focus:** v1.1 Pilot Ready -- Phase 10 in progress (SAML/SSO Security Hardening)

## Current Position

Phase: 10 of 12 (SAML/SSO Security Hardening) -- IN PROGRESS
Plan: 2 of 3 (10-01 and 10-02 complete)
Status: Phase 10 in progress -- SAML SSO and mTLS complete, key rotation remaining
Last activity: 2026-03-03 -- Completed 10-01 (SAML SSO Authentication)

Progress: [#########-] 92% (12/13 plans in v1.1)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 28 (v1.0)
- Total execution time: ~4 days
- Average: ~7 plans/day

**v1.1:**
- Plans completed: 12
- Plans remaining: 1 (Phase 10: 10-03 key rotation remaining)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 07    | 01   | 4min     | 2     | 8     |
| 07    | 02   | 4min     | 2     | 6     |
| 07    | 03   | 7min     | 2     | 7     |
| 08    | 01   | 3min     | 2     | 11    |
| 08    | 02   | 3min     | 2     | 3     |
| 09    | 01   | 7min     | 2     | 56    |
| 09    | 02   | 6min     | 2     | 8     |
| 09    | 03   | 8min     | 2     | 17    |
| 09    | 04   | 12min    | 2     | 26    |
| 09    | 05   | 2min     | 1     | 1     |
| 10    | 01   | 9min     | 2     | 11    |
| 10    | 02   | 6min     | 2     | 14    |

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions archived in PROJECT.md Key Decisions table (12 decisions).

v1.1 decisions:
- Roadmap: 6-phase structure derived from 21 requirements across 4 categories (Identity, Dashboard Core, Dashboard Advanced, Deployment)
- Roadmap: API key auth + RBAC first (Phase 7) because all dashboard routes and deployment artifacts depend on auth
- Roadmap: Docker Compose (Phase 8) before dashboard (Phase 9) so every UI feature can be smoke-tested end-to-end
- Roadmap: SAML/mTLS/key-rotation (Phase 10) deferred from identity foundation because law firm pilot uses API keys; bank pilot needs SAML
- Roadmap: Helm/sidecar/CA-cert (Phase 12) last because chart needs stable images and stable mTLS config
- 07-01: Used flat role_permissions table (role, permission, is_granted) instead of JSON column for queryability
- 07-01: Permissions do not auto-inherit via the default map; hierarchy is only for role-level comparisons
- 07-01: Kept existing department_id FK on users as primary department; user_departments join table is authoritative for access scope
- 07-01: Service accounts assigned super_admin role with is_service flag for internal identification
- 07-02: Used Elysia named macro .macro("auth", ...) with resolve pattern for per-route auth injection
- 07-02: Handler ctx typed as any because macro resolve types don't propagate through TS type system
- 07-02: Auth service created inside resolve/derive (not plugin level) to use decorated store.db
- 07-02: lastUsedAt updated fire-and-forget to avoid adding latency to auth hot path
- 07-03: Auth guards use role hierarchy: write=policy_admin+, read=read_only_auditor+
- 07-03: Department scoping at ClickHouse query level (WHERE IN clause) not post-fetch filtering
- 07-03: Stats violations and vendor-usage not department-scoped -- deferred to Phase 11
- 07-03: Out-of-scope department filter requests yield zero results via __no_access__ sentinel
- 08-01: Bare ${VAR} in TOML template with shell defaults in entrypoint before envsubst (envsubst ignores :-default syntax)
- 08-01: Control plane runs as default user (not non-root) to simplify volume permissions; Helm chart (Phase 12) enforces securityContext
- 08-01: Proto files at /proto/ in control plane image matching ../../../../proto/ relative path from gRPC module __dirname
- 08-01: OPA pinned to v1.4.2 via Dockerfile ARG for reproducible builds
- 08-01: No HEALTHCHECK in Rust Dockerfiles (TLS proxy/gRPC); health checks at compose level only
- 08-01: cmake installed in kernel builder stage for aws-lc-rs compilation
- 08-02: Removed env_file from kernel service -- explicit environment block prevents unexpected variable leaking
- 08-02: Rust 2024 edition requires unsafe blocks for env var mutation in tests; run with --test-threads=1
- 08-02: Dashboard exposed on port 8080 for dev convenience; minio-init uses $$ shell escaping for runtime vars
- 09-01: BFF proxy pattern -- all client API calls route through /api/proxy/[...path] which injects Bearer token from httpOnly cookie
- 09-01: Next.js 15 (not 16) for production reliability; standalone output for Docker
- 09-01: Dashboard port 3001 internal / 8080 external to avoid conflict with control plane on 3000
- 09-01: class-variance-authority added as shadcn/ui dependency (required by generated badge component)
- 09-02: KPI data derived from violations stats endpoint (sum all for requests, block+redact for violations) to avoid new API endpoints
- 09-02: useSSE hook uses module-level counter for event IDs to avoid SSR hydration mismatch with crypto.randomUUID
- 09-02: SSE hook reconnects after 5s on error with mountedRef guard to prevent state updates after unmount
- 09-02: Violation chart pivots flat records into per-hour rows; vendor chart aggregates per-hour-per-model into per-vendor totals
- 09-03: Rego string escaping via custom escapeRegoString() to prevent template injection in generated policies
- 09-03: Simple line-by-line diff (no external diff library) for version history comparison
- 09-03: Edit mode starts in raw Rego editor since template params cannot be reverse-engineered from Rego
- 09-03: Compilation status polling uses TanStack Query refetchInterval returning false to auto-stop
- 09-03: Used Dialog for confirmation dialogs (restore, delete) since AlertDialog not installed; same UX
- 09-04: In-page state toggle for framework detail view (not route-based) for simplicity
- 09-04: PDF generated server-side with PDFKit; blob downloaded via BFF proxy for auth continuity
- 09-04: Buffer to Uint8Array conversion for Bun/Elysia TS Response constructor compatibility
- 09-04: Vendor cards expand inline for models; framework cards grouped by jurisdiction when multiple present
- 09-04: Cursor stack pattern for TanStack Table forward/backward pagination
- 09-05: BFF proxy treats missing/empty Content-Type as JSON for backward compatibility; non-JSON responses piped as raw body stream
- 10-01: samlify 2.10.2 (CVE-2025-47949 safe); SAML private keys file-mounted only (Invariant #6)
- 10-01: Dual-mode auth: ik_live_* prefix routes to API key flow, all else to session token flow
- 10-01: JIT provisioning defaults to read_only_auditor role unless valid roleHint from IdP
- 10-01: Split dashboard auth into auth.ts (server) and auth-client.ts (client) for Next.js compatibility
- 10-01: Session tokens are 128-char hex (64 random bytes) with 8-hour expiry
- 10-01: BFF proxy unchanged -- already forwards tokens generically as Bearer tokens
- 10-02: ECDSA P-256 for internal CA and service certs (broader TLS library compat than Ed25519)
- 10-02: mTLS toggle via MTLS_ENABLED env var for backward-compatible local dev without Docker
- 10-02: Cert bytes stored as raw Vec<u8> in client structs, ClientTlsConfig rebuilt per connection (not Clone)
- 10-02: Shell script cert generation (not rcgen) for one-shot Alpine init container simplicity

### Research Flags

- Phase 10: samlify on Bun runtime needs isolated PoC before implementation -- RESOLVED in 10-01 (samlify 2.10.2 works with Bun)
- Phase 10: mTLS cert bootstrap automation needs spike -- RESOLVED in 10-02 (Alpine init container with openssl CLI)
- Phase 11: Anomaly detection ClickHouse query patterns need prototyping
- Phase 9: Policy Builder Rego generation from visual inputs -- RESOLVED in 09-03 (template engine with generateRego())

### Pending Todos

None yet.

### Blockers/Concerns

None -- Phase 10 in progress.

## Session Continuity

**Last session:** 2026-03-03T18:45:00Z
**Stopped at:** Completed 10-01 (SAML SSO Authentication)
**Resume file:** .planning/phases/10-saml-sso-security-hardening/10-01-SUMMARY.md
**Next action:** Execute 10-03 (Key Rotation) to complete Phase 10
