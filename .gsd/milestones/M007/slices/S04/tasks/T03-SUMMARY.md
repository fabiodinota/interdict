---
id: T03
parent: S04
milestone: M007
provides:
  - 10 vitest component test files for complex dashboard components (charts, tables, detail views, form dialogs)
  - 67 test cases covering recharts chart wrappers, data tables, detail views, form dialogs, and CRUD interactions
key_files:
  - dashboard/src/__tests__/components/violation-chart.test.tsx
  - dashboard/src/__tests__/components/vendor-usage-chart.test.tsx
  - dashboard/src/__tests__/components/policy-version-history.test.tsx
  - dashboard/src/__tests__/components/policy-override-table.test.tsx
  - dashboard/src/__tests__/components/model-list.test.tsx
  - dashboard/src/__tests__/components/framework-detail.test.tsx
  - dashboard/src/__tests__/components/rego-preview.test.tsx
  - dashboard/src/__tests__/components/anomaly-card.test.tsx
  - dashboard/src/__tests__/components/add-vendor-dialog.test.tsx
  - dashboard/src/__tests__/components/report-form.test.tsx
key_decisions:
  - Reuse recharts mock pattern from T01 (div stubs with data-testid and data-attributes) for ViolationChart (LineChart) and VendorUsageChart (BarChart)
  - Mock BaselineChart child component in AnomalyCard tests to avoid transitive recharts dependency
  - Mock MandatoryBadge with distinguishable text ("Locked"/"Optional") to avoid collision with column header text "Mandatory"
  - Fresh render per test for dialog components (AddVendorDialog) to prevent state leakage across tests in full suite
patterns_established:
  - LineChart recharts mock pattern: same div-stub approach as BarChart, with line-specific data-testid="line-{dataKey}"
  - Dialog test isolation: each test renders its own component and opens dialog fresh, avoiding state leakage from prior tests
  - Hook return shape mocking for complex hooks: useFramework returns { data: { data: framework }, isLoading } shape
  - Form dialog test pattern: open dialog → fill fields → click submit → assert mutate called with expected args + onSuccess callback
observability_surfaces:
  - none
duration: 15min
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Dashboard complex component tests — charts, tables, and detail views

**Added 10 vitest test files covering ViolationChart, VendorUsageChart, PolicyVersionHistory, PolicyOverrideTable, ModelList, FrameworkDetail, RegoPreview, AnomalyCard, AddVendorDialog, and ReportForm with 67 test cases total**

## What Happened

Created 10 test files targeting the complex component tier: chart wrappers, data tables, detail views, and form dialogs.

Key mocking strategies:
- **ViolationChart / VendorUsageChart**: Reused T01's recharts mock pattern (div stubs with `data-testid` + `data-*` attributes). ViolationChart tests verify the `pivotData()` transformation that pivots flat hourly records into `{hour, allow, block, redact}` chart rows. VendorUsageChart tests verify `aggregateByVendor()` which sums request counts per vendor.
- **PolicyVersionHistory**: Mocked `usePolicyVersions` and `useRestoreVersion` hooks. Tests cover expand/collapse, restore confirmation dialog flow (confirm + cancel), empty state, and loading state.
- **PolicyOverrideTable**: Mocked `useSetOverride`, `useRemoveOverride`, `useSetMandatory` hooks. Mocked `MandatoryBadge` child with distinguishable text to avoid collision with the "Mandatory" column header. Tests cover toggle interactions, mandatory policy disabled state, compliance officer column visibility, and empty state.
- **ModelList**: Mocked `useAddModel`, `useUpdateModel`, `useDeleteModel`. Tests cover CRUD operations: add model form, delete confirmation dialog, cancel flows, and empty state.
- **FrameworkDetail**: Mocked `useFramework`, `useActivateFramework`, `useDeactivateFramework`, `useToggleFrameworkPolicy`. Tests cover detail rendering with badges, activate/deactivate toggle, policy required toggle, empty policies, and loading skeleton.
- **RegoPreview**: Pure prop-driven component, no hook mocking needed. Tests cover form field rendering, submit/back actions, error display, and disabled-submit validation for empty name/rego.
- **AnomalyCard**: Mocked `BaselineChart` child to avoid transitive recharts dependency. Tests cover all anomaly types, severity levels, baseline/current data display, conditional chart rendering (only for volume_spike), and action links.
- **AddVendorDialog**: Managed dialog via internal state. Each test renders fresh to avoid state leakage that caused timeouts in the full suite. Tests cover form submission with all fields, required-only fields, disabled submit for empty required fields, and cancel path.
- **ReportForm**: Pure prop-driven with `onGenerate` callback. Tests cover date preset buttons, format selection, generate button click, disabled state during generation.

One test stability fix during development:
- AddVendorDialog tests timed out when run in full suite due to dialog state leaking between tests. Fixed by ensuring each test mounts its own component instance and opens dialog fresh, rather than relying on state from prior tests.

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — **45 test files pass, 298 test cases, 0 failures**
- All 10 new test files exist: ✓ violation-chart, vendor-usage-chart, policy-version-history, policy-override-table, model-list, framework-detail, rego-preview, anomaly-card, add-vendor-dialog, report-form
- Chart tests mock recharts consistently: ViolationChart (LineChart mock), VendorUsageChart (BarChart mock), AnomalyCard (BaselineChart child mock) ✓
- Form dialog tests verify both submission and cancellation: AddVendorDialog (submit + cancel), PolicyVersionHistory (restore confirm + cancel), ModelList (delete confirm + cancel) ✓
- Every test file includes at least one negative case (empty data, disabled submit, not-rendered chart, etc.) ✓

### Slice-level verification (partial — T03 is 3rd of 6 tasks):
- `cd dashboard && npx vitest run` — 45 test files pass (38 component + 7 other). Target ≥40 component test files. ✅ on track (38/40)
- Control-plane, Playwright, CI gate checks — not applicable to this task, deferred to T05/T06

## Diagnostics

None — test-only task, no runtime surfaces. Run `cd dashboard && npx vitest run --reporter=verbose` to see per-case results.

## Deviations

1. AddVendorDialog: Restructured tests for full-suite stability. Each test opens the dialog independently rather than relying on shared dialog state, preventing timeout failures caused by state leakage.
2. PolicyOverrideTable: MandatoryBadge mock uses "Locked"/"Optional" text instead of "Mandatory"/"Optional" to avoid `getByText("Mandatory")` collision with the table column header.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/__tests__/components/violation-chart.test.tsx` — tests LineChart with data pivoting + empty data + loading state
- `dashboard/src/__tests__/components/vendor-usage-chart.test.tsx` — tests BarChart with vendor aggregation + empty data + loading state
- `dashboard/src/__tests__/components/policy-version-history.test.tsx` — tests version list + expand + restore dialog + empty + loading
- `dashboard/src/__tests__/components/policy-override-table.test.tsx` — tests toggle interactions + mandatory badge + compliance officer column + empty state
- `dashboard/src/__tests__/components/model-list.test.tsx` — tests CRUD list + add form + delete dialog + cancel flows + empty state
- `dashboard/src/__tests__/components/framework-detail.test.tsx` — tests detail view + activate/deactivate + policy toggle + empty policies + loading
- `dashboard/src/__tests__/components/rego-preview.test.tsx` — tests code display + form fields + submit/back + error + validation
- `dashboard/src/__tests__/components/anomaly-card.test.tsx` — tests severity levels + anomaly types + baseline chart conditional + action links
- `dashboard/src/__tests__/components/add-vendor-dialog.test.tsx` — tests form submission + required field validation + cancel
- `dashboard/src/__tests__/components/report-form.test.tsx` — tests date presets + format selection + generate + disabled state
- `.gsd/milestones/M007/slices/S04/tasks/T03-PLAN.md` — added Observability Impact section
- `.gsd/milestones/M007/slices/S04/S04-PLAN.md` — marked T03 done
