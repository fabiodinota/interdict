# T04: 11-advanced-dashboard-views 04

**Slice:** S05 — **Milestone:** M002

## Description

Anomaly Detection alerts page -- enables compliance officers to view statistical anomalies (volume spikes, off-hours usage, vendor switching, topic drift) with baseline context and actionable quick-links.

Purpose: Satisfies DASH-10 -- compliance officers need proactive alerting when user behavior deviates from established patterns, with enough context to understand why something was flagged and take appropriate action.
Output: ClickHouse anomaly queries, control plane anomaly API, dashboard Anomalies page with severity-coded alert cards.

## Must-Haves

- [ ] "Compliance officer can view anomaly alerts showing volume spikes against baseline"
- [ ] "Compliance officer can view off-hours usage anomalies"
- [ ] "Compliance officer can view vendor switching anomalies"
- [ ] "Compliance officer can view topic drift anomalies (via prompt hash entropy)"
- [ ] "Each alert shows baseline context (normal vs observed) so the officer understands why it is flagged"
- [ ] "Alerts are categorized as Info, Warning, or Critical with color-coded badges"
- [ ] "Each alert has actionable quick-links navigating to relevant filtered views"

## Files

- `control-plane/src/modules/anomalies/index.ts`
- `control-plane/src/modules/anomalies/service.ts`
- `control-plane/src/modules/anomalies/model.ts`
- `control-plane/src/modules/anomalies/queries.ts`
- `control-plane/src/index.ts`
- `dashboard/src/app/(dashboard)/anomalies/page.tsx`
- `dashboard/src/components/anomalies/AnomalyCard.tsx`
- `dashboard/src/components/anomalies/AnomalyList.tsx`
- `dashboard/src/components/anomalies/BaselineChart.tsx`
- `dashboard/src/hooks/use-anomalies.ts`
