---
estimated_steps: 5
estimated_files: 10
---

# T03: Dashboard complex component tests — charts, tables, and detail views

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add vitest + @testing-library/react tests for 10 complex dashboard components: chart wrappers (recharts), data tables, detail views, and simpler form dialogs. Chart components need full recharts mocking. Table/detail components need data fixtures and routing mocks. AddVendorDialog and ReportForm need form submission testing.

Components: ViolationChart, VendorUsageChart, PolicyVersionHistory, PolicyOverrideTable, ModelList, FrameworkDetail, RegoPreview, AnomalyCard, AddVendorDialog, ReportForm.

## Steps

1. Read each component source to identify chart libraries, data shapes, routing needs, and form handlers
2. Create a shared recharts mock pattern (or reuse from T01's BaselineChart test) for ViolationChart and VendorUsageChart — mock `ResponsiveContainer`, `BarChart`, `LineChart`, etc. as simple div wrappers that render children
3. For PolicyVersionHistory and PolicyOverrideTable: create minimal version/override data fixtures matching prop types; test rendering, empty state, and toggle interactions
4. For ModelList: test CRUD list rendering, add/delete interactions with mocked mutation hooks
5. For AddVendorDialog and ReportForm: test form field rendering, submission with userEvent, and validation error states

## Must-Haves

- [ ] All 10 test files exist and pass `npx vitest run`
- [ ] Chart tests use consistent recharts mock pattern — no SVG rendering
- [ ] Form dialog tests verify both successful submission and cancellation paths
- [ ] Each test file includes at least one negative case (empty list, error state, invalid input)
- [ ] Data fixtures are minimal — only the fields the component actually reads

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — all 10 new test files pass
- No test file imports recharts without mocking it first

## Observability Impact

- **No runtime signals change** — this task adds test files only, no new runtime surfaces.
- **Test visibility**: `cd dashboard && npx vitest run --reporter=verbose` — each of the 10 new test files reports pass/fail per case. Grep for `FAIL` to find regressions. Failed assertions print expected vs received values and component render output.
- **Coverage**: `cd dashboard && npx vitest run --coverage` — the 10 new test files increase coverage for `components/dashboard/`, `components/policies/`, `components/department-policies/`, `components/anomalies/`, `components/vendors/`, `components/regulatory/`, and `components/reports/`.
- **Failure state**: Test failures are visible as non-zero exit codes from `npx vitest run` and per-case output in verbose mode.

## Inputs

- T01 BaselineChart test — recharts mock pattern to reuse
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — hook mock pattern for mutation functions
- Component source files for prop type definitions

## Expected Output

- `dashboard/src/__tests__/components/violation-chart.test.tsx` — tests chart rendering with data + empty data
- `dashboard/src/__tests__/components/vendor-usage-chart.test.tsx` — tests chart with vendor data + no vendors
- `dashboard/src/__tests__/components/policy-version-history.test.tsx` — tests version list + empty history
- `dashboard/src/__tests__/components/policy-override-table.test.tsx` — tests toggle interactions + empty table
- `dashboard/src/__tests__/components/model-list.test.tsx` — tests CRUD list + empty state + delete confirmation
- `dashboard/src/__tests__/components/framework-detail.test.tsx` — tests detail view with routing mock
- `dashboard/src/__tests__/components/rego-preview.test.tsx` — tests code display + empty policy
- `dashboard/src/__tests__/components/anomaly-card.test.tsx` — tests card with severity levels + chart mock
- `dashboard/src/__tests__/components/add-vendor-dialog.test.tsx` — tests form submission + cancellation
- `dashboard/src/__tests__/components/report-form.test.tsx` — tests report generation form + validation
