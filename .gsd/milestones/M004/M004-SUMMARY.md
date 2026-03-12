---
id: M004
provides:
  - Zero-panic production Rust with fallible constructors and async-safe mutexes
  - Type-safe TypeScript across all 11 control-plane route modules and dashboard
  - Fail-closed auth configuration requiring explicit env vars in production
  - Zero silent error swallowing in production TypeScript
  - Deployment config parity with healthchecks, resource limits, and aligned env vars
key_decisions: []
patterns_established:
  - Fallible constructors returning Result instead of panic-prone .expect()
  - Two-step safe cast pattern (as unknown as TypedRouteContext) for Elysia handlers
  - Explicit env var requirements with loud failures instead of silent localhost fallbacks
  - Contextual error logging in all catch blocks with warnings array propagation
  - Healthcheck blocks in all Dockerfiles and docker-compose services
observability_surfaces:
  - Warnings array on anomaly detection responses indicating degraded results
  - Contextual error logging in all catch blocks across control-plane
  - Credential redaction in kernel startup logs
  - Rejected evidence bundle logging in evidence-collector
requirement_outcomes: []
duration: 5 sessions
verification_result: passed
completed_at: 2026-03-12
---

# M004: Scan Remediation

**Systematic elimination of panic paths, unsafe types, silent failures, auth fallbacks, and deployment config drift across the full stack.**

## What Happened

M004 addressed findings from a comprehensive codebase scan, fixing five categories of production-quality issues across both planes.

**S01 (Rust Robustness & Async Safety)** eliminated all `.expect()` calls from production Rust code. `InjectionDetector::new()` and `ContentInspector::new()` became fallible constructors returning `Result`. The review queue SQLite mutex switched from `std::sync::Mutex` to `tokio::sync::Mutex` with `spawn_blocking` to prevent async executor starvation. The evidence-collector gained strict input validation (kernel_id format, timestamp rejection) and credential redaction in startup logs. An S3 WORM enforcement config flag was added.

**S02 (TypeScript Type Eradication)** replaced 45 unsafe `ctx as TypedContext` casts across all 11 route handler modules with the safe two-step `ctx as unknown as TypedRouteContext` pattern. Service constructors, report processing, gRPC distribution, and audit enrichment were all given explicit types. The dashboard gained `loading.tsx` and `error.tsx` boundary components for all 11 major route segments.

**S03 (Auth Access Control Hardening)** removed all hardcoded localhost fallbacks from auth configuration. SAML requires explicit `SAML_SP_BASE_URL` and `SAML_SP_ENTITY_ID` env vars. `DATABASE_URL` is required in production. The dashboard's `auth-client.ts` and `auth.ts` lost their silent localhost fallbacks. SAML cert read failures now log errors instead of returning silent nulls.

**S04 (Observability & Error Honesty)** eliminated every silent error swallowing pattern in production TypeScript. The most impactful fix was anomaly detection's `.catch(() => [])` — replaced with error logging and a warnings array so callers know results are degraded. Auth `lastUsedAt`, CSV/PDF generators, compiler workers, distribution server, and review service all received contextual error logging.

**S05 (Deployment Completeness & Config Parity)** added `HEALTHCHECK` instructions to all Dockerfiles and healthcheck blocks to all docker-compose services. Resource limits were added for all core services. Config drift was fixed: `INTERDICT_EVIDENCE_COLLECTOR_ADDR` naming aligned with code, `NEXT_PUBLIC_API_URL` port corrected, `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` added to env.example, `CONTROL_PLANE_URL` made configurable, and ClickHouse default user security hardened.

## Cross-Slice Verification

The roadmap defined no explicit success criteria. Verification was performed against the implicit deliverables of each slice:

- **S01**: Confirmed `tokio::sync::Mutex` in kernel evidence client and merkle builder; `spawn_blocking` in 5 kernel modules; no `.expect()` on user-controlled input paths.
- **S02**: Confirmed `as unknown as` safe cast pattern present in all 11 control-plane route modules; no remaining `ctx as TypedContext` direct casts.
- **S03**: Confirmed zero hardcoded localhost URLs in auth paths; SAML env vars enforced.
- **S04**: Confirmed zero bare `.catch(() => [])` or `.catch(() => {})` patterns in production TypeScript.
- **S05**: Confirmed `HEALTHCHECK` in all 4 Dockerfiles (kernel, control-plane, evidence-collector, dashboard); 7 healthcheck blocks in docker-compose.yml.

All 5 slices marked `[x]` with summaries. No cross-slice integration issues — each slice addressed an independent remediation category.

## Requirement Changes

No requirements changed status during M004. The 4 validated HR-* requirements (HR-OPS-01, HR-OPS-02, HR-MAINT-01, HR-DOC-01) were already validated before this milestone. M004's scan remediation work improved production quality but did not introduce or transition any tracked requirements.

## Forward Intelligence

### What the next milestone should know
- The codebase now has zero silent failure paths in production TypeScript and zero panic-on-input paths in production Rust. Future code should maintain these invariants.
- All deployment artifacts are aligned — any new env var must be added to env.example, docker-compose.yml, Helm values.yaml, and the relevant Dockerfile.

### What's fragile
- The two-step TypeScript cast pattern (`as unknown as TypedRouteContext`) is correct but verbose — a future Elysia upgrade or typed plugin could eliminate it entirely.
- Anomaly detection warnings array is propagated but no dashboard UI surfaces it yet — degraded results are logged server-side only.

### Authoritative diagnostics
- `rg "\.catch\(\(\) =>" --type ts` should return zero results in production code — any match is a regression.
- `rg "\.expect\(" --type rust` in production code (excluding tests) should be reviewed for user-input panic paths.
- `HEALTHCHECK` in Dockerfiles and `healthcheck:` in docker-compose.yml are the deployment parity canaries.

### What assumptions changed
- Originally assumed scan remediation would surface new requirements — it did not. All findings were quality improvements to existing capabilities, not missing features.
