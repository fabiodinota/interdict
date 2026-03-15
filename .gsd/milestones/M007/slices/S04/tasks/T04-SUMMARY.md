---
id: T04
parent: S04
milestone: M007
provides:
  - 8 vitest component test files for complex dashboard forms, dialogs, and wizards
  - 72 test cases covering PolicyWizard multi-step navigation, BatchVerifyTable batch operations, ReviewDialog resolution form, AuditFilters, RuleEditor, ParameterForm, RawRegoEditor, ThemeProvider
key_files:
  - dashboard/src/__tests__/components/policy-wizard.test.tsx
  - dashboard/src/__tests__/components/batch-verify-table.test.tsx
  - dashboard/src/__tests__/components/review-dialog.test.tsx
  - dashboard/src/__tests__/components/audit-filters.test.tsx
  - dashboard/src/__tests__/components/rule-editor.test.tsx
  - dashboard/src/__tests__/components/parameter-form.test.tsx
  - dashboard/src/__tests__/components/raw-rego-editor.test.tsx
  - dashboard/src/__tests__/components/theme-provider.test.tsx
key_decisions:
  - Mock all 5 PolicyWizard child components (CategoryPicker, TemplatePicker, ParameterForm, RuleEditor, RegoPreview) to isolate wizard step logic
  - Mock radix Dialog/Select/Popover/Tooltip primitives for components that rely on portal rendering (ReviewDialog, AuditFilters, RuleEditor, ParameterForm)
  - For BatchVerifyTable, use native checkbox role queries to test TanStack Table row selection
patterns_established:
  - Wizard step isolation pattern: mock all child step components with simple div + callback buttons, test step transitions via sequential user clicks
  - Complex form dialog test pattern: mock hooks + radix primitives, test render → interaction → validation → submission
  - TanStack Table test pattern: render with data fixtures, query checkboxes by role for selection, verify action button state
observability_surfaces:
  - none — test-only task, no runtime surfaces
duration: 10min
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T04: Dashboard complex component tests — forms, dialogs, and wizards

**Added 8 vitest test files with 72 test cases covering PolicyWizard (12 cases), BatchVerifyTable (11 cases), ReviewDialog (10 cases), AuditFilters (7 cases), RuleEditor (10 cases), ParameterForm (10 cases), RawRegoEditor (10 cases), and ThemeProvider (2 cases).**

## What Happened

Created 8 test files for the most complex dashboard components. Key approach:

- **PolicyWizard** (376 lines): Mocked all 5 child components (CategoryPicker, TemplatePicker, ParameterForm, RuleEditor, RegoPreview) with simple div stubs exposing callback buttons. Tests cover initial render at step 1, sequential navigation through all 5 steps, back navigation, skip rules step, raw editor mode toggle with warning dialog, and final submission calling createPolicy.

- **BatchVerifyTable** (365 lines): Mocked BundleDetailPanel and Tooltip. Tests cover empty state, loading skeleton, table rendering with column headers, truncated bundle IDs, row selection via checkboxes, select-all toggle, Verify Selected button disable/enable state, and pagination controls.

- **ReviewDialog**: Mocked useResolveReview hook, SlaTimer child, and radix Dialog/Select. Tests cover null item guard, interaction details rendering, cryptographic evidence hashes, resolution form fields, button states, character count validation, cancel behavior, policy rules badges, and SLA timer.

- **AuditFilters, RuleEditor, ParameterForm, RawRegoEditor, ThemeProvider**: Each tested for rendering, key interactions (add/remove conditions, form validation, error states), and navigation callbacks.

Total dashboard component test files: 46 (8 existing + 10 T01 + 10 T02 + 10 T03 + 8 T04).

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — all 8 new test files pass (72/72 test cases)
- `find dashboard/src/__tests__/components -name "*.test.tsx" | wc -l` — returns 46 ✅
- Full suite: 53 test files, 370 tests pass, 0 failures ✅
- PolicyWizard: 12 test cases (initial render, step labels, 5 step navigation, back nav, skip, raw mode toggle, warning dialog, submission) ✅
- BatchVerifyTable: 11 test cases (empty state, loading, data render, IDs, verify button, selection, select-all, pagination) ✅

## Diagnostics

- Run `cd dashboard && npx vitest run --reporter=verbose` to see per-test-case pass/fail for all 8 new files.
- PolicyWizard tests: if child components change their props interface, update the corresponding mock in policy-wizard.test.tsx.
- BatchVerifyTable tests: uses native checkbox role queries — if TanStack Table column definition changes, update column header assertions.

## Deviations

None — all 8 planned files created as specified.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/__tests__/components/policy-wizard.test.tsx` — 12 test cases: wizard step navigation, mode toggle, submission
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — 11 test cases: batch operations, selection, empty state, pagination
- `dashboard/src/__tests__/components/review-dialog.test.tsx` — 10 test cases: resolution form, validation, cancellation
- `dashboard/src/__tests__/components/audit-filters.test.tsx` — 7 test cases: filter rendering, apply, clear, department input
- `dashboard/src/__tests__/components/rule-editor.test.tsx` — 10 test cases: add/remove conditions, navigation, rego preview
- `dashboard/src/__tests__/components/parameter-form.test.tsx` — 10 test cases: dynamic fields, validation, error preview
- `dashboard/src/__tests__/components/raw-rego-editor.test.tsx` — 10 test cases: metadata fields, submit validation, error display, line numbers
- `dashboard/src/__tests__/components/theme-provider.test.tsx` — 2 test cases: renders children, wraps with NextThemesProvider
- `.gsd/milestones/M007/slices/S04/tasks/T04-PLAN.md` — added Observability Impact section
- `.gsd/milestones/M007/slices/S04/S04-PLAN.md` — marked T04 as done

## Slice-Level Verification (intermediate — T04 of T06)

- ✅ `cd dashboard && npx vitest run` — 53 test files pass, ≥40 component test files (46 confirmed)
- ⬜ `cd control-plane && bun test` — pending T05
- ⬜ `npx playwright test --project=smoke` — pending T06
- ⬜ CI coverage gate — pending T06
- ⬜ vitest coverage thresholds — pending T06
