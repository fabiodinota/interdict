---
estimated_steps: 4
estimated_files: 8
---

# T04: Dashboard complex component tests — forms, dialogs, and wizards

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add vitest + @testing-library/react tests for the 8 most complex dashboard components (>150 lines, multi-step forms, batch operations). PolicyWizard (376 lines) and BatchVerifyTable (365 lines) are the most complex — test key interaction paths selectively rather than exhaustively. Also includes ThemeProvider as a simple structural test.

Components: AuditFilters, RawRegoEditor, RuleEditor, ParameterForm, ReviewDialog, BatchVerifyTable, PolicyWizard, ThemeProvider.

## Steps

1. Read each component source to identify form state, step transitions, child component dependencies, and submission handlers
2. For PolicyWizard: mock child components (CategoryPicker, TemplatePicker, ParameterForm) to isolate wizard step logic; test initial render shows step 1, navigation between steps, and final submission
3. For BatchVerifyTable: test initial render with batch data, row selection, and bulk action trigger; mock verification hooks
4. For AuditFilters: test filter field rendering, filter application via button click, and reset/clear behavior
5. For ReviewDialog, RuleEditor, ParameterForm, RawRegoEditor: test render + key interaction + error/empty state; mock complex children with `vi.mock()` to keep tests focused

## Must-Haves

- [ ] All 8 test files exist and pass `npx vitest run`
- [ ] PolicyWizard test covers: initial render, step navigation, submission — at minimum 3 test cases
- [ ] BatchVerifyTable test covers: render with data, row selection, empty state — at minimum 3 test cases
- [ ] Complex child components are mocked to prevent test fragility
- [ ] Total dashboard component test files ≥40 after this task (8 existing + 10 + 10 + 10 + 8 = 46)

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — all 8 new test files pass
- `find dashboard/src/__tests__/components -name "*.test.tsx" | wc -l` — returns ≥46

## Observability Impact

- **Test-only task** — no runtime surfaces added or changed.
- **Diagnostic command**: `cd dashboard && npx vitest run --reporter=verbose` shows per-test-case pass/fail for all 8 new files.
- **Failure visibility**: Vitest verbose reporter prints assertion diffs (expected vs received) and component render output on failure.
- **Coverage**: These 8 files contribute to line/branch coverage for forms, dialogs, and wizard components. Run `npx vitest run --coverage` to see per-file coverage.

## Inputs

- T01-T03 test files — established mock patterns for recharts, hooks, navigation
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — pattern for mocking hooks and child components
- Component source files for form state and step logic

## Expected Output

- `dashboard/src/__tests__/components/audit-filters.test.tsx` — tests multi-filter form + reset
- `dashboard/src/__tests__/components/raw-rego-editor.test.tsx` — tests code editor rendering + empty state
- `dashboard/src/__tests__/components/rule-editor.test.tsx` — tests rule builder + validation
- `dashboard/src/__tests__/components/parameter-form.test.tsx` — tests dynamic fields + empty/error
- `dashboard/src/__tests__/components/review-dialog.test.tsx` — tests resolution form + cancellation
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — tests batch operations + selection + empty
- `dashboard/src/__tests__/components/policy-wizard.test.tsx` — tests wizard steps + navigation + submission
- `dashboard/src/__tests__/components/theme-provider.test.tsx` — tests provider renders children
