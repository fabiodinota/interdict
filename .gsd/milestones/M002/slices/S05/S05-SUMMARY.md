---
id: S05
parent: M002
milestone: M002
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S05: Advanced Dashboard Views

**# Phase 11 Plan 01: Evidence Verification UI and API Summary**

## What Happened

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

# Phase 11 Plan 02: Human Review Queue Summary

**Review queue with optimistic-lock claim, mandatory resolution workflow, SLA countdown timers, and background ClickHouse escalation sync**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T20:43:31Z
- **Completed:** 2026-03-03T20:50:08Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- review_items Postgres table with composite status+SLA index for efficient queue sorting
- Review queue API with GET /queue, POST /:id/claim (409 on conflict), POST /:id/resolve (mandatory category + notes)
- Background sync job creating review items from ClickHouse escalations every 60 seconds
- Auto-escalation of expired pending items past 4-hour SLA deadline
- Dashboard Review Queue page with live SLA countdown timers (yellow at 25%, red at expired)
- Claim-then-review workflow with ReviewDialog for mandatory resolution category and reasoning

## Task Commits

Each task was committed atomically:

1. **Task 1: Review queue Postgres schema and control plane API** - `7d7e5cd` (feat)
2. **Task 2: Human Review Queue dashboard page with SLA timers** - `e5edec0` (feat)

## Files Created/Modified
- `control-plane/src/db/schema/reviews.ts` - review_items Postgres table schema
- `control-plane/src/db/schema/index.ts` - Added reviewItems export
- `control-plane/src/modules/reviews/model.ts` - TypeBox schemas for queue params and resolve body
- `control-plane/src/modules/reviews/service.ts` - ReviewService with claim, resolve, sync, auto-escalate
- `control-plane/src/modules/reviews/index.ts` - Elysia plugin at /api/v1/reviews
- `control-plane/src/index.ts` - Wired reviewsModule import and .use()
- `dashboard/src/hooks/use-reviews.ts` - TanStack Query hooks for review queue
- `dashboard/src/components/reviews/SlaTimer.tsx` - SLA countdown with color-coded severity
- `dashboard/src/components/reviews/ReviewDialog.tsx` - Resolution dialog with mandatory category + notes
- `dashboard/src/components/reviews/ReviewQueue.tsx` - TanStack Table with status filter tabs
- `dashboard/src/app/(dashboard)/reviews/page.tsx` - Review Queue page with KPI summary cards

## Decisions Made
- Optimistic locking via UPDATE WHERE status='pending' RETURNING * pattern; null result triggers 409
- Background sync polls ClickHouse every 60s for policy_action='escalate' bundles not yet in review_items
- SLA = 4 hours; color thresholds at 25% remaining (yellow) and 0% (red/EXPIRED)
- violation_confirmed maps to 'rejected' status; all other resolutions map to 'approved' status
- risk_score uses token_count as proxy since ClickHouse schema lacks dedicated risk_score column

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Review queue complete, compliance officers can manage Layer 3 escalations
- Plans 11-03 and 11-04 can proceed independently (no dependency on 11-02)

---
*Phase: 11-advanced-dashboard-views*
*Completed: 2026-03-03*

# Phase 11 Plan 03: Department Policy Management Summary

**Department policy override API with mandatory enforcement and dashboard toggle UI using Drizzle upserts and optimistic TanStack Query mutations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T20:43:50Z
- **Completed:** 2026-03-03T20:48:10Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- department_policy_overrides table with unique constraint and cascade deletes
- isMandatory column on policies table with mandatory enforcement in service layer
- 4 API endpoints: effective policies, set override, remove override, toggle mandatory
- Server-side department membership verification on all department-scoped operations
- Dashboard page with toggle switches, source badges (Global/Department override), mandatory lock badges
- Compliance officer additional column to mark/unmark policies as mandatory
- Summary stats (total, overrides, mandatory) and empty states

## Task Commits

Each task was committed atomically:

1. **Task 1: Department policy overrides schema and control plane API** - `8ef6646` (feat)
2. **Task 2: Department Policy Management dashboard page** - `95fbe9e` (feat)

## Files Created/Modified
- `control-plane/src/db/schema/department-overrides.ts` - department_policy_overrides table definition
- `control-plane/src/db/schema/policies.ts` - Added isMandatory column
- `control-plane/src/db/schema/index.ts` - Export departmentPolicyOverrides
- `control-plane/src/modules/department-overrides/model.ts` - TypeBox schemas for 4 endpoints
- `control-plane/src/modules/department-overrides/service.ts` - Override CRUD with membership and mandatory checks
- `control-plane/src/modules/department-overrides/index.ts` - Elysia plugin with auth guards
- `control-plane/src/index.ts` - Wire departmentOverridesModule
- `dashboard/src/hooks/use-department-policies.ts` - TanStack Query hooks for override operations
- `dashboard/src/components/department-policies/MandatoryBadge.tsx` - Lock badge with tooltip
- `dashboard/src/components/department-policies/PolicyOverrideTable.tsx` - Policy table with toggles
- `dashboard/src/app/(dashboard)/department-policies/page.tsx` - Department Policies page

## Decisions Made
- Super admins and compliance officers bypass department membership check for flexibility
- Upsert pattern (INSERT ON CONFLICT UPDATE) simplifies create/update into single operation
- When setting mandatory=true, all existing disable-overrides for that policy are auto-deleted
- Optimistic toggle pattern: UI updates immediately, reverts on mutation error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Department override API ready for integration testing with Docker Compose
- Schema migration needed (drizzle-kit push) when deploying to actual database
- Plans 11-02 and 11-04 can proceed independently

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (8ef6646, 95fbe9e) confirmed in git history.

---
*Phase: 11-advanced-dashboard-views*
*Completed: 2026-03-03*

# Phase 11 Plan 04: Anomaly Detection Alerts Summary

**Four ClickHouse anomaly detection queries (volume spikes, off-hours, vendor switching, topic drift) with severity-coded dashboard alert cards showing baseline context and actionable quick-links**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T20:43:50Z
- **Completed:** 2026-03-03T20:49:26Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Four anomaly detection ClickHouse queries with CTE pattern and event_date partition pruning (volume spikes vs 7-day same-hour average, off-hours usage vs 30-day baseline, vendor switching from dominant vendor, topic drift via prompt hash entropy)
- AnomalyService computing severity levels (info/warning/critical) with human-readable summaries showing "Normal: X, Observed: Y" format
- Anomalies page at /anomalies with KPI summary cards (total/critical/warning/info counts), severity filter tabs, and 60-second auto-refresh
- Severity-coded AnomalyCard with left color stripe, type icon, severity badge, baseline vs observed context, inline BaselineChart for volume spikes, and actionable quick-links to relevant filtered views

## Task Commits

Each task was committed atomically:

1. **Task 1: Anomaly detection ClickHouse queries and control plane API** - `0b80caf` (feat)
2. **Task 2: Anomaly Detection dashboard page with severity-coded alert cards** - `920650a` (feat)

## Files Created/Modified
- `control-plane/src/modules/anomalies/queries.ts` - Four ClickHouse anomaly detection query functions with partition pruning
- `control-plane/src/modules/anomalies/service.ts` - AnomalyService with severity computation, summary generation, and action link creation
- `control-plane/src/modules/anomalies/model.ts` - TypeBox schemas for anomaly alert and summary response types
- `control-plane/src/modules/anomalies/index.ts` - Elysia plugin at /api/v1/anomalies with compliance_officer auth
- `control-plane/src/index.ts` - Wired anomaliesModule import and .use()
- `dashboard/src/hooks/use-anomalies.ts` - TanStack Query hooks with 60s refetchInterval
- `dashboard/src/components/anomalies/AnomalyCard.tsx` - Severity-coded card with baseline context and action links
- `dashboard/src/components/anomalies/AnomalyList.tsx` - Container component with empty state
- `dashboard/src/components/anomalies/BaselineChart.tsx` - Compact Recharts bar chart for baseline vs current comparison
- `dashboard/src/app/(dashboard)/anomalies/page.tsx` - Anomalies page with KPI cards, severity filter tabs, auto-refresh

## Decisions Made
- All four ClickHouse queries use CTE (Common Table Expression) pattern: baseline subquery over historical window + current window subquery + INNER JOIN + threshold filter. This allows clean separation of baseline computation from current observation
- Prompt hash used only in uniqExact() aggregate function calls, never returned as raw values in API responses. Topic drift reports unique hash counts only, fully compliant with Invariant #6
- Severity thresholds follow a consistent ratio scale: info (1.2-2x), warning (2-5x), critical (5x+). Off-hours anomalies use absolute percentage thresholds (20% / 50% difference) for more intuitive classification
- Queries run in parallel via Promise.all with per-query catch handlers to prevent one failing query from blocking all results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Anomaly detection complete; all four Phase 11 plans (01-04) now finished
- Phase 12 (Helm/sidecar/deployment) can proceed when ready

## Self-Check: PASSED

All 9 key files verified present. Both task commits (0b80caf, 920650a) confirmed in git log.

---
*Phase: 11-advanced-dashboard-views*
*Completed: 2026-03-03*
