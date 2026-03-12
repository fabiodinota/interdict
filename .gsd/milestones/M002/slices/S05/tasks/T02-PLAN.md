# T02: 11-advanced-dashboard-views 02

**Slice:** S05 — **Milestone:** M002

## Description

Human Review Queue for Layer 3 escalation management -- enables compliance officers to review, approve, or reject escalated AI interactions with SLA timers and mandatory reasoning.

Purpose: Satisfies DASH-08 -- compliance officers need a structured workflow for handling AI interactions flagged as requiring human judgment.
Output: Postgres schema for review items, control plane review queue API, dashboard Review Queue page with SLA timers and claim/resolve workflow.

## Must-Haves

- [ ] "Compliance officer can view a queue of Layer 3 escalated interactions sorted by SLA urgency"
- [ ] "Compliance officer can claim a review item with optimistic locking (409 if already claimed)"
- [ ] "Compliance officer can approve or reject with mandatory category and reasoning"
- [ ] "SLA countdown timers show yellow at 75% and red at 100% of SLA elapsed"
- [ ] "Full interaction content (prompt hash, response, policy, risk score) visible in review detail"

## Files

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
