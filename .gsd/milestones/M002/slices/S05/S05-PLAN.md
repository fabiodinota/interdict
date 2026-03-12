# S05: Advanced Dashboard Views

**Goal:** Evidence Verification UI and API -- enables auditors to independently verify evidence bundle integrity through a dedicated dashboard page with three-step cryptographic verification, plus inline quick-verify on audit trail records.
**Demo:** Evidence Verification UI and API -- enables auditors to independently verify evidence bundle integrity through a dedicated dashboard page with three-step cryptographic verification, plus inline quick-verify on audit trail records.

## Must-Haves


## Tasks

- [x] **T01: 11-advanced-dashboard-views 01**
  - Evidence Verification UI and API -- enables auditors to independently verify evidence bundle integrity through a dedicated dashboard page with three-step cryptographic verification, plus inline quick-verify on audit trail records.

Purpose: Satisfies DASH-07 -- auditors need to independently verify the tamper-evident evidence chain without trusting the system that created it.
Output: Control plane verification endpoints + Evidence Verification dashboard page with batch and single-bundle verification + inline quick-verify button on audit trail rows. Also adds all Phase 11 shared types and sidebar nav items so subsequent plans (02-04) can run in parallel.
- [x] **T02: 11-advanced-dashboard-views 02**
  - Human Review Queue for Layer 3 escalation management -- enables compliance officers to review, approve, or reject escalated AI interactions with SLA timers and mandatory reasoning.

Purpose: Satisfies DASH-08 -- compliance officers need a structured workflow for handling AI interactions flagged as requiring human judgment.
Output: Postgres schema for review items, control plane review queue API, dashboard Review Queue page with SLA timers and claim/resolve workflow.
- [x] **T03: 11-advanced-dashboard-views 03**
  - Department Policy Management UI -- enables department managers to view inherited policies and toggle non-mandatory ones on/off for their department, with clear visual distinction between global and overridden policies.

Purpose: Satisfies DASH-09 -- department managers need autonomy to adapt policy enforcement for their team while maintaining centralized control over critical regulatory policies.
Output: Postgres schema for overrides, control plane override API with department scoping, dashboard Department Policies page with toggle switches and mandatory lock indicators.
- [x] **T04: 11-advanced-dashboard-views 04**
  - Anomaly Detection alerts page -- enables compliance officers to view statistical anomalies (volume spikes, off-hours usage, vendor switching, topic drift) with baseline context and actionable quick-links.

Purpose: Satisfies DASH-10 -- compliance officers need proactive alerting when user behavior deviates from established patterns, with enough context to understand why something was flagged and take appropriate action.
Output: ClickHouse anomaly queries, control plane anomaly API, dashboard Anomalies page with severity-coded alert cards.

## Files Likely Touched

- `dashboard/src/components/layout/Sidebar.tsx`
- `dashboard/src/types/api.ts`
- `dashboard/src/app/(dashboard)/evidence/page.tsx`
- `dashboard/src/components/evidence/VerificationStepper.tsx`
- `dashboard/src/components/evidence/BatchVerifyTable.tsx`
- `dashboard/src/components/evidence/BundleDetailPanel.tsx`
- `dashboard/src/components/audit/AuditTable.tsx`
- `dashboard/src/hooks/use-evidence.ts`
- `control-plane/src/modules/evidence/index.ts`
- `control-plane/src/modules/evidence/service.ts`
- `control-plane/src/modules/evidence/model.ts`
- `control-plane/src/index.ts`
- `control-plane/src/db/schema/reviews.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/modules/reviews/index.ts`
- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/model.ts`
- `control-plane/src/index.ts`
- `dashboard/src/app/(dashboard)/reviews/page.tsx`
- `dashboard/src/components/reviews/ReviewQueue.tsx`
- `dashboard/src/components/reviews/ReviewDialog.tsx`
- `dashboard/src/components/reviews/SlaTimer.tsx`
- `dashboard/src/hooks/use-reviews.ts`
- `control-plane/src/db/schema/department-overrides.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/db/schema/policies.ts`
- `control-plane/src/modules/department-overrides/index.ts`
- `control-plane/src/modules/department-overrides/service.ts`
- `control-plane/src/modules/department-overrides/model.ts`
- `control-plane/src/index.ts`
- `dashboard/src/app/(dashboard)/department-policies/page.tsx`
- `dashboard/src/components/department-policies/PolicyOverrideTable.tsx`
- `dashboard/src/components/department-policies/MandatoryBadge.tsx`
- `dashboard/src/hooks/use-department-policies.ts`
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
