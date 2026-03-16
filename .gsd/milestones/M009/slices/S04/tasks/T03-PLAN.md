# T03: ARIA attributes on BatchVerifyTable, VendorCard, and anomaly tabs

## Description

Three accessibility gaps — all additive attribute additions to existing components. No behavioral changes, just correct ARIA semantics.

- **BatchVerifyTable**: checkboxes are raw `<input type="checkbox">` without `aria-label`
- **VendorCard**: "Show models" / "Hide models" toggle lacks `aria-expanded`
- **Anomaly severity tabs**: `<button>` elements inside a styled `<div>` — missing `role="tablist"`, `role="tab"`, `aria-selected`

## Steps

1. **Add aria-labels to BatchVerifyTable checkboxes**
   - File: `dashboard/src/components/evidence/BatchVerifyTable.tsx`
   - Find the header row checkbox (`<input type="checkbox">` in the `<thead>` or header area). Add `aria-label="Select all bundles"`.
   - Find the per-row checkboxes (inside the `.map()` rendering rows). Add `aria-label={`Select bundle ${bundle.id}`}` using whatever identifier is available on the row data (likely `bundle.id` or `bundle.bundle_id`). Read the component to find the correct field name.
   - If the component uses a custom Checkbox component instead of raw `<input>`, apply the same attribute — `aria-label` works on any element.

2. **Add aria-expanded to VendorCard toggle**
   - File: `dashboard/src/components/vendors/VendorCard.tsx`
   - Find the button that toggles model list visibility. Look for `onClick` handler that toggles an `expanded` or `showModels` state.
   - Add `aria-expanded={expanded}` (or whatever the boolean state variable is named) to that button element.
   - The button text likely already changes between "Show models" and "Hide models" — `aria-expanded` communicates the state to assistive technology.

3. **Add ARIA roles to anomaly severity tabs**
   - File: `dashboard/src/app/(dashboard)/anomalies/page.tsx`
   - Find the container `<div>` wrapping the severity filter buttons (~line 131, has `className="flex gap-1 rounded-lg border bg-muted p-1"`). Add `role="tablist"`.
   - On each `<button>` inside `SEVERITY_TABS.map()` (~line 133), add:
     - `role="tab"`
     - `aria-selected={severityFilter === tab.key}`
   - The existing `onClick` and active styling remain unchanged.

4. **Extend BatchVerifyTable test**
   - File: `dashboard/src/__tests__/components/batch-verify-table.test.tsx`
   - Add test: query `screen.getByRole("checkbox", { name: "Select all bundles" })` — it should resolve without error.
   - Add test: with mock data of 2+ bundles, query `screen.getAllByRole("checkbox", { name: /Select bundle/ })` — count should match data length.

5. **Extend VendorCard test**
   - File: `dashboard/src/__tests__/components/vendor-card.test.tsx`
   - Add test: render VendorCard, find the toggle button (likely by text "Show models" or similar). Assert `aria-expanded` is `"false"`. Click it. Assert `aria-expanded` is `"true"`.

6. **Create anomalies page test**
   - File: `dashboard/src/__tests__/pages/anomalies-page.test.tsx` (new)
   - Mock the `useAnomalies` hook (check the import in `anomalies/page.tsx`) to return empty data or minimal mock data.
   - Mock any child components that pull external data (anomaly cards, etc.) as simple stubs if needed.
   - Test: `screen.getByRole("tablist")` resolves.
   - Test: `screen.getAllByRole("tab")` returns elements matching `SEVERITY_TABS` length (the tabs array has entries like All, Critical, High, Medium, Low — check the actual array in the file at ~line 15).
   - Test: on initial render, check that the active tab has `aria-selected="true"` and others have `aria-selected="false"`.
   - Test: click a different tab, verify `aria-selected` updates.

7. **Run full dashboard test suite**
   - `cd dashboard && npx vitest run`
   - Verify zero failures across all tests — not just the ones modified in this task.

## Must-Haves

- BatchVerifyTable: header checkbox has `aria-label="Select all bundles"`, row checkboxes have `aria-label` with bundle identifier
- VendorCard: toggle button has `aria-expanded` reflecting current state
- Anomaly page: container has `role="tablist"`, buttons have `role="tab"` + `aria-selected`
- All new tests pass
- Full `npx vitest run` passes with zero failures

## Verification

```bash
cd dashboard && npx vitest run batch-verify vendor-card anomalies-page
cd dashboard && npx vitest run  # full suite
```

## Inputs

- `dashboard/src/components/evidence/BatchVerifyTable.tsx` — checkboxes without aria-labels
- `dashboard/src/components/vendors/VendorCard.tsx` — toggle without aria-expanded
- `dashboard/src/app/(dashboard)/anomalies/page.tsx` — severity tabs without ARIA roles; `SEVERITY_TABS` array at ~line 15, tab buttons at ~line 132
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — existing 11 test cases
- `dashboard/src/__tests__/components/vendor-card.test.tsx` — existing 5 test cases

## Expected Output

- Modified `BatchVerifyTable.tsx` with `aria-label` on all checkboxes
- Modified `VendorCard.tsx` with `aria-expanded` on toggle button
- Modified `anomalies/page.tsx` with `role="tablist"`, `role="tab"`, `aria-selected`
- Extended `batch-verify-table.test.tsx` with ≥2 new test cases
- Extended `vendor-card.test.tsx` with ≥1 new test case
- New `dashboard/src/__tests__/pages/anomalies-page.test.tsx` with ≥3 test cases
- `npx vitest run` passes with zero failures
