---
phase: 11-advanced-dashboard-views
plan: 01
subsystem: api, ui
tags: [elysia, ed25519, clickhouse, tanstack-query, react, next.js, evidence-verification]

# Dependency graph
requires:
  - phase: 09-dashboard-core
    provides: "Dashboard scaffold, BFF proxy, TanStack Query hooks, shadcn/ui components"
  - phase: 10-saml-sso-hardening
    provides: "Ed25519 signing keys table, auth middleware, session auth"
provides:
  - "Evidence verification API (POST /verify, GET /bundles)"
  - "Evidence Verification dashboard page at /evidence"
  - "VerificationStepper component for three-step pass/fail display"
  - "Inline QuickVerifyButton on audit trail rows"
  - "All Phase 11 shared types (ReviewItem, DepartmentEffectivePolicy, AnomalyAlert, AnomalySummary)"
  - "All Phase 11 sidebar nav items (Evidence, Reviews, Dept Policies, Anomalies)"
  - "Placeholder comment in control-plane index.ts for Plans 02-04 module wiring"
affects: [11-02, 11-03, 11-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [evidence-verification-three-step, inline-quick-verify, batch-verify-table]

key-files:
  created:
    - control-plane/src/modules/evidence/index.ts
    - control-plane/src/modules/evidence/service.ts
    - control-plane/src/modules/evidence/model.ts
    - dashboard/src/app/(dashboard)/evidence/page.tsx
    - dashboard/src/components/evidence/VerificationStepper.tsx
    - dashboard/src/components/evidence/BatchVerifyTable.tsx
    - dashboard/src/components/evidence/BundleDetailPanel.tsx
    - dashboard/src/hooks/use-evidence.ts
  modified:
    - control-plane/src/index.ts
    - dashboard/src/types/api.ts
    - dashboard/src/components/layout/Sidebar.tsx
    - dashboard/src/components/audit/AuditTable.tsx

key-decisions:
  - "WebCrypto Ed25519 for signature verification (Bun native, no extra deps)"
  - "Merkle proof step returns null/partial since Merkle roots are in S3 only"
  - "Partial bundle data in QuickVerifyButton -- full crypto fields fetched server-side"
  - "All Phase 11 types and nav items added in Plan 01 to prevent file conflicts with Plans 02-04"

patterns-established:
  - "Evidence verification three-step pattern: hash chain, signature, Merkle"
  - "Inline quick-verify pattern: icon button on table row triggering mutation and opening detail sheet"
  - "Batch verify pattern: checkbox selection, bulk mutation, per-row result badges"

requirements-completed: [DASH-07]

# Metrics
duration: 6min
completed: 2026-03-03
---

# Phase 11 Plan 01: Evidence Verification UI and API Summary

**Three-step evidence verification API (hash chain, Ed25519 signature, Merkle stub) with dedicated Evidence Verification page, batch verify table, and inline quick-verify on audit trail rows**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T20:34:34Z
- **Completed:** 2026-03-03T20:40:19Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Control plane evidence module with POST /verify (three-step cryptographic verification) and GET /bundles (paginated listing with department scoping)
- Evidence Verification dashboard page with BatchVerifyTable supporting checkbox batch selection, cursor pagination, and per-bundle pass/fail badges
- VerificationStepper vertical stepper with expandable raw cryptographic details per step
- Inline QuickVerifyButton on each audit trail row in AuditTable.tsx
- All Phase 11 shared types pre-defined in api.ts for Plans 02-04 parallel execution
- All four Phase 11 sidebar nav items added in a single pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Evidence verification API endpoints and all Phase 11 shared wiring** - `6571c85` (feat)
2. **Task 2: Evidence Verification dashboard page, inline quick-verify on audit trail, and all Phase 11 shared types** - `e8e6344` (feat)

## Files Created/Modified
- `control-plane/src/modules/evidence/model.ts` - TypeBox schemas and verification result types
- `control-plane/src/modules/evidence/service.ts` - EvidenceVerificationService with three-step verification logic
- `control-plane/src/modules/evidence/index.ts` - Elysia plugin with POST /verify and GET /bundles endpoints
- `control-plane/src/index.ts` - Wired evidenceModule, added placeholder comment for Plans 02-04
- `dashboard/src/types/api.ts` - Added all Phase 11 types (EvidenceBundle, VerificationResult, ReviewItem, DepartmentEffectivePolicy, AnomalyAlert, AnomalySummary)
- `dashboard/src/hooks/use-evidence.ts` - TanStack Query hooks for evidence bundles and verification
- `dashboard/src/components/evidence/VerificationStepper.tsx` - Vertical stepper with pass/fail/N/A icons and expandable details
- `dashboard/src/components/evidence/BatchVerifyTable.tsx` - Batch verify table with checkbox selection and pagination
- `dashboard/src/components/evidence/BundleDetailPanel.tsx` - Sheet with full bundle metadata, verification stepper, and raw crypto data
- `dashboard/src/app/(dashboard)/evidence/page.tsx` - Evidence Verification page
- `dashboard/src/components/layout/Sidebar.tsx` - Added Evidence, Reviews, Dept Policies, Anomalies nav items
- `dashboard/src/components/audit/AuditTable.tsx` - Added QuickVerifyButton and actions column

## Decisions Made
- Used WebCrypto Ed25519 (crypto.subtle) for signature verification instead of adding @noble/ed25519 -- Bun supports Ed25519 natively
- Merkle proof verification step returns `passed: null` with explanation since Merkle roots are only in S3 and control plane lacks S3 access. Future enhancement: merkle_anchors Postgres table
- QuickVerifyButton passes partial bundle data from AuditRecord (bundle_id, chain_hash, timestamp, actor, vendor, policy_action). Full cryptographic fields are fetched server-side by the verify API
- All Phase 11 types and sidebar nav items added in Plan 01 to prevent file conflicts when Plans 02-04 execute in parallel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Evidence verification API and UI complete; Plans 02-04 can execute in parallel
- Sidebar nav items and shared types pre-wired for Reviews, Dept Policies, Anomalies pages
- Placeholder comment in control-plane/src/index.ts marks where Plans 02-04 add their modules

## Self-Check: PASSED

All 9 key files verified present. Both task commits (6571c85, e8e6344) confirmed in git log.

---
*Phase: 11-advanced-dashboard-views*
*Completed: 2026-03-03*
