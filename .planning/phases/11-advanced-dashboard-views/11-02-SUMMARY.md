---
phase: 11-advanced-dashboard-views
plan: 02
subsystem: api, ui, database
tags: [postgres, elysia, react, tanstack-query, sla-timer, optimistic-locking, review-queue]

# Dependency graph
requires:
  - phase: 11-advanced-dashboard-views
    provides: "ReviewItem/ReviewResolution types in api.ts, sidebar nav items, reviewsModule stub"
provides:
  - "review_items Postgres table with status/SLA indexes"
  - "ReviewService with optimistic lock claim, resolution validation, background sync"
  - "Elysia reviewsModule at /api/v1/reviews (queue, claim, resolve)"
  - "Human Review Queue dashboard page at /reviews with SLA timers"
affects: [phase-12-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [optimistic-locking-claim, background-sync-clickhouse-to-postgres, sla-countdown-timer]

key-files:
  created:
    - control-plane/src/db/schema/reviews.ts
    - control-plane/src/modules/reviews/index.ts
    - control-plane/src/modules/reviews/service.ts
    - control-plane/src/modules/reviews/model.ts
    - dashboard/src/hooks/use-reviews.ts
    - dashboard/src/components/reviews/SlaTimer.tsx
    - dashboard/src/components/reviews/ReviewDialog.tsx
    - dashboard/src/components/reviews/ReviewQueue.tsx
    - dashboard/src/app/(dashboard)/reviews/page.tsx
  modified:
    - control-plane/src/db/schema/index.ts
    - control-plane/src/index.ts

key-decisions:
  - "Optimistic locking via UPDATE WHERE status='pending' RETURNING * pattern; null result = 409 conflict"
  - "Background sync polls ClickHouse every 60s for policy_action='escalate' bundles not yet in review_items"
  - "SLA = 4 hours; color thresholds at 25% remaining (yellow) and 0% (red/EXPIRED)"
  - "violation_confirmed maps to 'rejected' status; all others map to 'approved' status"
  - "risk_score uses token_count as proxy since ClickHouse schema lacks dedicated risk_score column"

patterns-established:
  - "Optimistic lock claim: UPDATE WHERE status='pending' returns null on conflict -> 409"
  - "Background ClickHouse->Postgres sync: poll escalations, check existing via inArray, insert new"
  - "SLA timer: local useState+setInterval for 1s countdown, TanStack Query 30s refetch for data freshness"

requirements-completed: [DASH-08]

# Metrics
duration: 7min
completed: 2026-03-03
---

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
