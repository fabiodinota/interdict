---
id: T03
parent: S04
milestone: M009
provides:
  - ARIA attributes on BatchVerifyTable checkboxes, VendorCard toggle, and anomaly severity tabs
key_files:
  - dashboard/src/components/evidence/BatchVerifyTable.tsx
  - dashboard/src/components/vendors/VendorCard.tsx
  - dashboard/src/app/(dashboard)/anomalies/page.tsx
  - dashboard/src/__tests__/components/batch-verify-table.test.tsx
  - dashboard/src/__tests__/components/vendor-card.test.tsx
  - dashboard/src/__tests__/pages/anomalies-page.test.tsx
key_decisions:
  - Used bundle_id for per-row aria-label in BatchVerifyTable — matches the field already used for selection state tracking
patterns_established:
  - ARIA tablist/tab/aria-selected pattern for custom styled tab groups (severity filter tabs in anomalies page)
observability_surfaces:
  - none — purely static markup additions testable via getByRole queries and axe-core audits
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: ARIA attributes on BatchVerifyTable, VendorCard, and anomaly tabs

**Added aria-label on batch table checkboxes, aria-expanded on VendorCard toggle, and role="tablist"/role="tab"/aria-selected on anomaly severity filter tabs**

## What Happened

Three additive ARIA fixes across three components, all purely attribute additions with no behavioral changes:

1. **BatchVerifyTable** — Added `aria-label="Select all bundles"` to the header checkbox and `aria-label={`Select bundle ${bundle_id}`}` to each per-row checkbox.
2. **VendorCard** — Added `aria-expanded={expanded}` to the "Show models"/"Hide models" toggle button.
3. **Anomalies page** — Added `role="tablist"` to the severity filter container div, and `role="tab"` + `aria-selected={severityFilter === tab.key}` to each severity tab button.

Extended existing test files for BatchVerifyTable (2 new tests) and VendorCard (1 new test). Created a new anomalies page test file with 4 tests covering tablist presence, tab count, initial aria-selected state, and selection state updates on click.

## Verification

- `npx vitest run batch-verify vendor-card anomalies-page` — **3 files, 23 tests, all passed**
- `npx vitest run` (full suite) — **55 files, 415 tests, zero failures**

Slice-level verification status (all items):
- ✅ `cd dashboard && npx vitest run` — all tests pass, zero failures
- ✅ home-page.test.tsx — verifies `lastUpdated` set via effect (T01)
- ✅ review-queue-simple.test.tsx — verifies `onStatsUpdate` called via effect (T01)
- ✅ sla-timer.test.tsx — verifies single interval for multiple instances (T02)
- ✅ auth-saml-callback.test.ts — verifies `getSessionCookieOptions()` is used (T02)
- ✅ batch-verify-table.test.tsx — verifies `aria-label` on checkboxes (T03)
- ✅ vendor-card.test.tsx — verifies `aria-expanded` on toggle (T03)
- ✅ anomalies-page.test.tsx — verifies `role="tablist"`, `role="tab"`, `aria-selected` (T03)

All slice-level verification checks pass. S04 is complete.

## Diagnostics

No runtime diagnostic surfaces — these are static ARIA attributes. Regression detection is via:
- `getByRole("checkbox", { name: "Select all bundles" })` in batch-verify-table.test.tsx
- `toHaveAttribute("aria-expanded")` in vendor-card.test.tsx
- `getByRole("tablist")` and `getAllByRole("tab")` in anomalies-page.test.tsx

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/components/evidence/BatchVerifyTable.tsx` — added `aria-label` to header and per-row checkboxes
- `dashboard/src/components/vendors/VendorCard.tsx` — added `aria-expanded={expanded}` to toggle button
- `dashboard/src/app/(dashboard)/anomalies/page.tsx` — added `role="tablist"` on container, `role="tab"` + `aria-selected` on tab buttons
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — added 2 tests for aria-label assertions
- `dashboard/src/__tests__/components/vendor-card.test.tsx` — added 1 test for aria-expanded toggle
- `dashboard/src/__tests__/pages/anomalies-page.test.tsx` — new file, 4 tests for ARIA tab semantics
