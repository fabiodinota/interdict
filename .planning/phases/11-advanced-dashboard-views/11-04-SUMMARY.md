---
phase: 11-advanced-dashboard-views
plan: 04
subsystem: api, ui
tags: [elysia, clickhouse, anomaly-detection, tanstack-query, recharts, react, next.js]

# Dependency graph
requires:
  - phase: 11-advanced-dashboard-views
    plan: 01
    provides: "AnomalyAlert and AnomalySummary types in api.ts, sidebar nav item for Anomalies, placeholder comment in index.ts"
  - phase: 09-dashboard-core
    provides: "Dashboard scaffold, BFF proxy, TanStack Query hooks, shadcn/ui components, Recharts"
provides:
  - "Four ClickHouse anomaly detection queries (volume, off-hours, vendor switch, topic drift)"
  - "Anomaly detection API at /api/v1/anomalies with severity filtering"
  - "Anomalies dashboard page at /anomalies with severity-coded alert cards"
  - "Inline baseline comparison chart for volume spike alerts"
  - "Actionable quick-links from anomaly cards to audit trail, vendors, department policies"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [anomaly-detection-cte-queries, severity-coded-alert-cards, baseline-comparison-chart]

key-files:
  created:
    - control-plane/src/modules/anomalies/queries.ts
    - control-plane/src/modules/anomalies/service.ts
    - control-plane/src/modules/anomalies/model.ts
    - control-plane/src/modules/anomalies/index.ts
    - dashboard/src/app/(dashboard)/anomalies/page.tsx
    - dashboard/src/components/anomalies/AnomalyCard.tsx
    - dashboard/src/components/anomalies/AnomalyList.tsx
    - dashboard/src/components/anomalies/BaselineChart.tsx
    - dashboard/src/hooks/use-anomalies.ts
  modified:
    - control-plane/src/index.ts

key-decisions:
  - "All four ClickHouse queries use CTE pattern with event_date partition pruning for efficient scanning"
  - "Prompt hash used only in uniqExact() aggregates, never returned as raw values (Invariant #6)"
  - "Severity thresholds: info >= 1.2x, warning >= 2x, critical >= 5x baseline ratio"
  - "Off-hours severity uses absolute percentage thresholds instead of ratio for more intuitive classification"

patterns-established:
  - "Anomaly detection CTE pattern: baseline subquery + current window subquery + INNER JOIN + threshold filter"
  - "Severity-coded alert card: left color stripe + type icon + severity badge + baseline context + action links"
  - "Inline baseline comparison chart: compact Recharts BarChart inside card component"

requirements-completed: [DASH-10]

# Metrics
duration: 5min
completed: 2026-03-03
---

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
