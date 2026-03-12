---
id: M003
provides:
  - Internally consistent evidence verification across Rust, TypeScript, and dashboard
  - Auth bootstrap without raw bearer credential persistence
  - Honest reporting with real scope filtering and no silent error masking
  - Real actor identity attribution in evidence bundles
  - Bounded retry queue for durable evidence delivery with operator-visible health metrics
  - Single authoritative review workflow store (Postgres)
  - Shared typed database access across control-plane services
  - 62 dashboard tests from zero automated coverage
  - Non-root containers, pinned image tags, air-gapped OPA build path
  - Zero-trust NetworkPolicy, PDB, and HPA Helm templates
key_decisions:
  - "D016: Evidence signature payload = protobuf-encoded bundle with 6 chain/sig fields zeroed"
  - "D017: Postgres single authoritative store for review items; kernel SQLite is local-only"
  - "D018: OPA download isolated into multi-stage Dockerfile for air-gapped cache replacement"
  - "D019: Release builds require secure evidence transport (HTTPS + mTLS cert material)"
  - "D020: Distribution mTLS server identity is explicit runtime config (tls_server_name)"
  - "D021: Seed/bootstrap operators receive principal + key-prefix metadata only; no plaintext credential reveal"
  - "D022: Dashboard session cookies store exchanged opaque session tokens, not raw API keys"
  - "D023: Evidence verification uses two-step bundle fetch plus adjacent-day predecessor window"
patterns_established:
  - Golden-fixture cross-language test pattern for cryptographic verification
  - Bounded retry queue with health metrics for durable async delivery
  - Shared types module (shared/types.ts) for cross-service type safety
  - Vitest + testing-library test infrastructure for Next.js dashboard
  - Air-gapped multi-stage Dockerfile isolation pattern
  - Opt-in Helm template pattern (disabled by default, enable via values.yaml)
observability_surfaces:
  - DeliveryHealth metrics (batches_sent, batches_failed, events_dropped, retries, consecutive_failures)
  - Honest report failure surfacing (no silent catch-block zeros)
  - escalation_source column for review provenance tracking
requirement_outcomes:
  - id: v1.2-evidence-verification
    from_status: active
    to_status: validated
    proof: "S01 — cross-language golden fixtures, content_bytes verification in Rust + TS, 12 tests"
  - id: v1.2-auth-bootstrap
    from_status: active
    to_status: validated
    proof: "S02 — session minted during code exchange, no raw bearer in Postgres"
  - id: v1.2-ci-enforcement
    from_status: active
    to_status: validated
    proof: "S02 — tsc + test CI job for control-plane, eslint + build CI job for dashboard, 0 errors"
  - id: v1.2-reporting-honesty
    from_status: active
    to_status: validated
    proof: "S03 — 7 silent catch-block zeros eliminated, scope filtering via policy_scope_assignments, 128 tests"
  - id: v1.2-evidence-attribution
    from_status: active
    to_status: validated
    proof: "S04 — 9 hardcoded actors replaced with real identity from request headers, bounded retry queue"
  - id: v1.2-review-workflow
    from_status: active
    to_status: validated
    proof: "S05 — Postgres authoritative store, UNIQUE on bundle_id, ON CONFLICT DO NOTHING, ingest endpoint"
  - id: v1.2-maintainability
    from_status: active
    to_status: validated
    proof: "S06 — shared/types.ts, AppDb in 5 high-risk sites, 14 store casts typed, resolveDb()"
  - id: v1.2-dashboard-testing
    from_status: active
    to_status: validated
    proof: "S07 — 62 tests across 8 files, BFF proxy (16 tests), auth (9 tests), evidence verification UI"
  - id: v1.2-deployment-artifacts
    from_status: active
    to_status: validated
    proof: "S08 — non-root UID 1000, pinned image tags, air-gapped OPA stage, root README"
  - id: v1.2-platform-hardening
    from_status: active
    to_status: validated
    proof: "S09 — 10 Helm templates (NetworkPolicy, PDB, HPA), readOnlyRootFilesystem, drop ALL caps"
duration: 9 sessions
verification_result: passed
completed_at: 2026-03-12
---

# M003: Trustworthiness & Hardening

**Eliminated every known overclaim, silent failure, and security gap across the full stack — evidence verification, auth, reporting, delivery, review workflow, deployment, and Kubernetes security controls.**

## What Happened

M003 was a systematic trust audit across the entire Interdict platform. Rather than adding features, every slice identified and fixed a place where the system's behavior didn't match what it claimed.

**Evidence integrity (S01)** fixed the root disagreement: the collector signed `content_bytes` but the control plane verified against `chain_hash`. Both Rust and TypeScript now verify the same canonical payload. Golden-fixture tests ensure cross-language consistency.

**Auth hardening (S02)** eliminated raw bearer credential persistence in the SAML handoff path. Sessions are minted during code exchange. TypeScript CI enforcement was added for both control-plane and dashboard — 0 tsc errors, all tests passing.

**Reporting honesty (S03)** replaced 7 silent catch-block zeros with real error propagation, fixed N+1 queries, and added actual policy scope filtering via a new `policy_scope_assignments` table.

**Identity and delivery (S04)** replaced all 9 hardcoded "anonymous" actor values with real identity from request headers and replaced fire-and-forget evidence flush with a bounded retry queue (7 retries, 64 batch cap) with operator-visible DeliveryHealth metrics.

**Review workflow (S05)** made Postgres the single authoritative store for review items, demoting ClickHouse to read-model. Deterministic idempotent creation via `ON CONFLICT DO NOTHING` and a service-to-service ingest endpoint replaced the fragile sync loop.

**Maintainability (S06)** created `shared/types.ts` with `AppDb`, `AppClickHouse`, `AppStore`, `AuthenticatedUser`, and `RouteContext`. Typed 5 high-risk database access sites and 14 store casts. Fixed Date serialization in review fields.

**Dashboard testing (S07)** took the dashboard from zero to 62 automated tests across 8 files. The BFF proxy route — the primary trust boundary — received the most coverage (16 tests).

**Deployment hardening (S08)** added non-root users (UID 1000), isolated OPA download into a separate build stage for air-gapped compatibility, pinned all image tags, and separated production guidance from local development defaults.

**Kubernetes hardening (S09)** added 10 Helm templates: NetworkPolicy (zero-trust pod-to-pod), PDB (availability during rollouts), and HPA (kernel + control-plane autoscaling). All opt-in via values.yaml. Hardened every container with `readOnlyRootFilesystem: true` and `capabilities.drop: [ALL]`.

## Cross-Slice Verification

Each slice was verified independently with its own test suite:

- **S01:** 12 golden-fixture tests for chain hash, Ed25519, hex codec across Rust and TypeScript
- **S02:** 106/106 tests pass, 0 tsc errors, dashboard builds clean
- **S03:** 128 tests pass including 18 new scope/reporting tests
- **S04:** Bounded retry queue tests, DeliveryHealth metric assertions, actor identity threading
- **S05:** 11 new tests for idempotent creation, ingest endpoint, reconciliation
- **S06:** tsc clean, Date serialization regression tests, typed access verification
- **S07:** 62 tests across 8 files — BFF proxy (16), auth login (6), auth logout (3), evidence verification UI
- **S08:** Dockerfile structure verification, non-root user confirmation, pinned tag audit
- **S09:** Helm template lint, NetworkPolicy rule verification, security context assertions

All 9 slices passed verification. No blockers discovered.

## Requirement Changes

All 10 v1.2 Active requirements transitioned to Validated:

- v1.2-evidence-verification: active → validated — S01 cross-language golden fixtures
- v1.2-auth-bootstrap: active → validated — S02 session minting, no raw bearer
- v1.2-ci-enforcement: active → validated — S02 tsc + eslint CI jobs
- v1.2-reporting-honesty: active → validated — S03 silent zeros eliminated, scope filtering
- v1.2-evidence-attribution: active → validated — S04 real actor identity, bounded retry
- v1.2-review-workflow: active → validated — S05 Postgres authoritative store
- v1.2-maintainability: active → validated — S06 shared types, typed access
- v1.2-dashboard-testing: active → validated — S07 62 tests from zero
- v1.2-deployment-artifacts: active → validated — S08 non-root, pinned, air-gapped
- v1.2-platform-hardening: active → validated — S09 NetworkPolicy, PDB, HPA, hardened contexts

## Forward Intelligence

### What the next milestone should know
- The platform is feature-complete for v1.2. The remaining gaps are operational: CI lint coverage for non-Rust/TS artifacts (Docker, Helm, proto, shell, YAML), local developer workflow automation, production-code warning reduction, and doc/state accuracy.
- The 4 validated requirements in REQUIREMENTS.md (HR-OPS-01, HR-OPS-02, HR-MAINT-01, HR-DOC-01) represent the next logical work targets.

### What's fragile
- Evidence verification's adjacent-day predecessor window (D023) is a ClickHouse partition pruning workaround — if partitioning scheme changes, this breaks silently.
- The 27 intentionally untyped route handlers in control-plane rely on Elysia's type inference — if Elysia's type system changes, these become real `any` holes.
- Dashboard tests mock all API calls — no integration tests exercise real BFF→API→DB flows yet.

### Authoritative diagnostics
- `DeliveryHealth` metrics (S04) are the first place to look when evidence delivery is suspected to be failing — they track consecutive failures, retries, and drops.
- `shared/types.ts` (S06) is the type authority for cross-service database and auth access patterns.
- The BFF proxy test suite (S07, 16 tests) is the most thorough trust-boundary test surface in the dashboard.

### What assumptions changed
- Originally assumed ClickHouse could be authoritative for review items — S05 proved Postgres must own workflow state.
- Originally assumed evidence verification was consistent — S01 found the collector and control plane were verifying different payloads.
- Originally assumed deployment artifacts were production-ready — S08 found containers ran as root with unpinned tags.

## Files Created/Modified

- `kernel/` — Actor identity threading, bounded retry queue, DeliveryHealth metrics
- `control-plane/shared/types.ts` — Cross-service type definitions
- `control-plane/` — Evidence verification fix, scope filtering, review consolidation, typed access
- `dashboard/` — 62 tests across 8 files, vitest infrastructure
- `dashboard/Dockerfile`, `control-plane/Dockerfile` — Non-root users, pinned tags
- `deploy/helm/` — 10 new templates (NetworkPolicy, PDB, HPA), hardened security contexts
- `docker-compose.yml` — Local development only designation
- `README.md` — Root project README
