---
phase: 09-dashboard-core-views
plan: 02
subsystem: ui
tags: [recharts, tanstack-query, sse, eventsource, kpi, charts, real-time, shadcn]

# Dependency graph
requires:
  - phase: 09-dashboard-core-views
    plan: 01
    provides: Dashboard foundation with BFF proxy, auth flow, shadcn components, layout shell
provides:
  - 4 KPI stat cards (total requests, violations, active policies, active vendors)
  - Violation trend line chart with per-action-type lines (allow/block/redact)
  - Vendor usage bar chart with aggregated request counts per vendor
  - Time range selector (24h/7d/30d) with manual refresh and last-updated timestamp
  - SSE activity feed with auto-reconnection and 50-event cap
  - TanStack Query hooks with 30-second polling for dashboard stats
  - Reusable useSSE hook for EventSource connections
affects: [09-03, 09-04, 11-dashboard-advanced]

# Tech tracking
tech-stack:
  added: []
  patterns: [SSE hook with auto-reconnect, TanStack Query 30s polling for chart data, Recharts with CSS variable theming, KPI derivation from API aggregates]

key-files:
  created:
    - dashboard/src/hooks/use-dashboard-stats.ts
    - dashboard/src/hooks/useSSE.ts
    - dashboard/src/components/dashboard/KpiCards.tsx
    - dashboard/src/components/dashboard/TimeRangeSelector.tsx
    - dashboard/src/components/dashboard/ViolationChart.tsx
    - dashboard/src/components/dashboard/VendorUsageChart.tsx
    - dashboard/src/components/dashboard/ActivityFeed.tsx
  modified:
    - dashboard/src/app/(dashboard)/page.tsx

key-decisions:
  - "KPI data derived from violations stats endpoint: total requests = sum all violation_count, violations today = block + redact counts"
  - "useSSE hook uses module-level counter for stable event IDs instead of crypto.randomUUID to avoid SSR issues"
  - "Violation chart pivots flat records into { hour, allow, block, redact } for per-action-type Recharts lines"
  - "Vendor usage chart aggregates per-hour-per-model records into per-vendor totals for the bar chart"
  - "SSE hook reconnects after 5s on error via setTimeout, cleans up EventSource on unmount"

patterns-established:
  - "Dashboard data hooks: TanStack Query with 30s refetchInterval and keepPreviousData for flicker-free polling"
  - "SSE hook pattern: useSSE(url, { maxEvents, reconnectDelay }) returns { events, connected, clear }"
  - "Chart components: Recharts wrapped in shadcn Card with Skeleton loading state"
  - "Time range state: managed at page level, getDateRange(range) converts to ISO from/to strings"
  - "KPI cards: responsive grid with icon+label+value pattern and Intl.NumberFormat for thousands"

requirements-completed: [DASH-03]

# Metrics
duration: 6min
completed: 2026-03-03
---

# Phase 9 Plan 02: Dashboard Home Screen & Real-Time Charts Summary

**Dashboard home with 4 KPI cards, violation trend line chart, vendor usage bar chart, time range selector (24h/7d/30d), and SSE-powered live activity feed with auto-reconnection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T04:45:42Z
- **Completed:** 2026-03-03T04:52:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- 4 KPI stat cards with skeleton loading, number formatting, and color-coded icons (requests, violations, policies, vendors)
- Violation trend line chart (Recharts) with lines per action type (allow/block/redact) using theme-aware CSS variables
- Vendor usage bar chart with per-vendor aggregation, custom tooltip showing model list, and color-coded bars
- Time range selector (24h/7d/30d) with manual refresh button and live "last updated: Xs ago" timestamp
- SSE activity feed with connection status indicator, action badges, relative timestamps, and clear button
- Reusable useSSE hook with 50-event cap, 5-second auto-reconnection, and proper cleanup on unmount
- All chart data polls every 30 seconds via TanStack Query refetchInterval with keepPreviousData

## Task Commits

Each task was committed atomically:

1. **Task 1: Build KPI cards, charts, time range selector, and dashboard hooks** - `ad59339` (feat)
2. **Task 2: SSE activity feed with reconnection** - `9b660f7` (feat)

## Files Created/Modified
- `dashboard/src/hooks/use-dashboard-stats.ts` - TanStack Query hooks for violations, vendor usage, policies count, vendors count
- `dashboard/src/hooks/useSSE.ts` - Reusable SSE hook with EventSource, auto-reconnect, event capping
- `dashboard/src/components/dashboard/KpiCards.tsx` - 4 KPI stat cards in responsive grid
- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` - 24h/7d/30d toggle with refresh button and timestamp
- `dashboard/src/components/dashboard/ViolationChart.tsx` - Recharts LineChart with allow/block/redact lines
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` - Recharts BarChart with per-vendor aggregation
- `dashboard/src/components/dashboard/ActivityFeed.tsx` - SSE-powered live event feed with status indicator
- `dashboard/src/app/(dashboard)/page.tsx` - Home page composing all dashboard components

## Decisions Made
- **KPI data derivation**: Total requests and violations today derived from the violations stats endpoint (sum of violation_count across actions, with block+redact filtered for violations). This avoids creating a new API endpoint.
- **Event ID generation**: Used module-level incrementing counter instead of crypto.randomUUID() to avoid SSR/hydration mismatch issues in Next.js.
- **Chart data pivoting**: Violation chart transforms flat (hour, action, count) records into pivoted rows for multi-line rendering. Vendor chart aggregates per-hour-per-model rows into per-vendor totals.
- **SSE reconnection**: 5-second reconnect delay with proper cleanup prevents connection leak. mountedRef guard prevents state updates after unmount.

## Deviations from Plan

None - plan executed exactly as written. The BFF proxy SSE support was already implemented in Plan 09-01 (Task 2 step 1 was already complete).

## Issues Encountered
- Pre-existing stale `.next` build cache caused ENOENT error in build trace collection. Resolved by cleaning `.next` directory before build. Not related to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard home screen complete with full data visualization and real-time feed
- Plan 09-03 can build policy list/builder using the established component patterns and API hooks
- Plan 09-04 can build audit trail, vendors, regulatory views using the same patterns

## Self-Check: PASSED

All 8 key files verified present. Both commit hashes (ad59339, 9b660f7) confirmed in git log. Build succeeds.

---
*Phase: 09-dashboard-core-views*
*Completed: 2026-03-03*
