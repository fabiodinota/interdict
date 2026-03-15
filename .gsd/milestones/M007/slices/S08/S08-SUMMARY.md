---
id: S08
parent: M007
milestone: M007
provides:
  - WCAG AA accessibility for dashboard: aria-label on 4 icon buttons, vitest-axe assertions on 6 components, @axe-core/playwright WCAG AA check
  - 578-line operator guide covering deployment, configuration, certificates, key rotation, monitoring, backup, and upgrades
  - 417-line troubleshooting reference covering 9 problem categories with diagnostic commands
  - 692-line REST API reference covering all 13 control-plane modules (53 endpoints)
  - 273-line gRPC API reference covering both proto services with full message schemas
  - PROJECT.md, README.md, and STATE.md updated to v1.5 reflecting M007 completion
requires:
  - slice: S01
    provides: Relay test patterns and proven hot-path coverage for documentation accuracy
  - slice: S02
    provides: Evidence signing test patterns and queue/store coverage for documentation accuracy
  - slice: S03
    provides: Clean dependency tree for accurate dependency documentation
  - slice: S04
    provides: Comprehensive test coverage baseline and E2E smoke test validating documented stack
  - slice: S05
    provides: CI/CD release pipeline for documented release workflow
  - slice: S06
    provides: CSP nonce hardening and Helm network policies for security documentation
  - slice: S07
    provides: Docker/Compose/Helm configurations, monitoring stack, backup scripts for operator guide
affects: []
key_files:
  - docs/operator/guide.md
  - docs/operator/troubleshooting.md
  - docs/api/rest.md
  - docs/api/grpc.md
  - dashboard/src/__tests__/setup.ts
  - dashboard/src/components/dashboard/TimeRangeSelector.tsx
  - dashboard/src/components/vendors/ModelList.tsx
  - dashboard/src/components/layout/Sidebar.tsx
  - dashboard/src/components/policies/PolicyRow.tsx
  - dashboard/e2e/smoke.spec.ts
  - .gsd/PROJECT.md
  - README.md
  - .gsd/STATE.md
key_decisions:
  - D042: Manual API docs over @elysiajs/openapi runtime integration — better editorial control, avoids Elysia version risk
  - D043: vitest-axe color-contrast rule disabled in happy-dom — CSSOM not implemented, rely on Playwright for browser-level WCAG
patterns_established:
  - "axe-core assertion: `const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } }); expect(results).toHaveNoViolations();`"
  - "Playwright WCAG AA: `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()` filtering critical/serious"
  - "Operator doc voice: imperative second-person, symptom → cause → fix troubleshooting pattern, cross-reference footer"
  - "API doc structure: ToC → Auth → Envelope → Pagination → Errors → Roles → per-module sections with tables + schema examples"
observability_surfaces:
  - "vitest-axe violations print rule ID, impact level, failing HTML snippet to test output"
  - "`npx vitest run --reporter=verbose` shows per-component a11y pass/fail"
  - "Static docs: `wc -l docs/operator/guide.md docs/operator/troubleshooting.md docs/api/rest.md docs/api/grpc.md`"
drill_down_paths:
  - .gsd/milestones/M007/slices/S08/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S08/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S08/tasks/T03-SUMMARY.md
  - .gsd/milestones/M007/slices/S08/tasks/T04-SUMMARY.md
duration: 68m
verification_result: passed
completed_at: 2026-03-15
---

# S08: Documentation, Accessibility & Polish

**Complete operator documentation suite (guide + troubleshooting + REST/gRPC API refs), WCAG AA-compliant dashboard with axe-core CI integration, and v1.5 project tracking updates — finalizing M007 Production Readiness milestone**

## What Happened

This slice delivered four tasks that closed the final gaps in M007:

**T01: Dashboard accessibility fixes + axe-core test integration (20m)**
Installed `vitest-axe` and `@axe-core/playwright`. Added `aria-label` to 4 icon buttons (3 planned: TimeRangeSelector refresh, ModelList delete, Sidebar collapse + 1 discovered: PolicyRow Switch toggle). Integrated vitest-axe matchers into test setup via `expect.extend(matchers)` — the vitest-axe v0.1.0 extend-expect dist file is empty, so direct import was necessary. Added `toHaveNoViolations()` assertions to 6 component tests (TimeRangeSelector, Sidebar, AuditFilters, PolicyRow, RouteError, RouteLoading), each disabling `color-contrast` (happy-dom CSSOM limitation). Added WCAG AA axe-core assertion to Playwright smoke test using AxeBuilder.

**T02: Operator guide + troubleshooting guide (18m)**
Created `docs/operator/guide.md` (578 lines) covering quick start (Docker Compose), Kubernetes deployment (Helm), configuration reference (7 env var tables), certificate management (proxy CA + internal mTLS), signing key rotation, monitoring (`--profile monitoring`), backup (`scripts/backup.sh`), environment validation, and upgrade procedures. Created `docs/operator/troubleshooting.md` (417 lines) covering 9 problem categories: certificate/mTLS, database connectivity, evidence pipeline, policy distribution, signing keys, CSP violations, Docker Compose, Helm/Kubernetes, plus a 14-row diagnostic commands table. Both follow the `full-text-storage.md` voice.

**T03: API documentation (20m)**
Created `docs/api/rest.md` (692 lines) covering all 13 control-plane modules (53 endpoints) with authentication (dual-mode API key + session), response envelope, cursor-based pagination, error codes, role hierarchy, and per-module endpoint tables with request/response schemas. Created `docs/api/grpc.md` (273 lines) covering EvidenceCollectorService (SubmitEvidence client-streaming) and PolicyDistributionService (Subscribe server-stream + Acknowledge unary) with full message schemas, connection details, TLS config, and grpcurl examples.

**T04: Project tracking updates (10m)**
Updated PROJECT.md with v1.5 Production Readiness section listing 11 M007 deliverable categories. Updated README.md current status to v1.5 with new Documentation section linking all 5 operator/API docs and enhanced Production Considerations with cross-references. Updated STATE.md marking M007 complete.

## Verification

All 10 slice-level checks pass:

1. ✅ Operator guide exists with 578 lines (≥200 required)
2. ✅ Troubleshooting guide exists with 417 lines (≥100 required)
3. ✅ API docs exist (rest.md 692 lines + grpc.md 273 lines)
4. ✅ `cd dashboard && npx vitest run` — 385 tests pass (53 test files, 0 failures)
5. ✅ TimeRangeSelector has aria-label (≥1)
6. ✅ ModelList has aria-label (≥1)
7. ✅ Sidebar has aria-label (≥1)
8. ✅ `grep "axe" dashboard/e2e/smoke.spec.ts` — AxeBuilder import and usage present
9. ✅ `grep "v1.5" .gsd/PROJECT.md` — v1.5 Production Readiness section present
10. ✅ `grep "docs/operator" README.md` — 6 references to operator docs

Diagnostic verification:
- `npx vitest run --reporter=verbose 2>&1 | grep "axe"` — 6 axe-core a11y assertions all pass
- Zero FAIL lines, zero violation lines in test output

## Requirements Advanced

- HR-DOC-01 — v1.5 status fully reflected in PROJECT.md, README.md, and STATE.md with all M007 deliverables documented

## Requirements Validated

- HR-DOC-01 — PROJECT.md, README.md, and STATE.md now accurately reflect the repo's verified v1.5 state including all M007 production readiness deliverables (previously validated for M005/S04, now re-validated for M007 scope)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T01: Fixed a 4th icon button a11y violation not in the original plan — PolicyRow.tsx Switch missing `aria-label`, discovered by axe-core during test integration (critical impact `button-name` rule)
- T01: Used `expect.extend(matchers)` instead of `import 'vitest-axe/extend-expect'` — the extend-expect dist file is empty in vitest-axe v0.1.0

## Known Limitations

- `color-contrast` axe-core rule is disabled in vitest-axe (happy-dom) tests — happy-dom doesn't implement CSSOM so color checks produce false negatives. Color-contrast is validated in Playwright smoke test which runs in a real browser.
- API docs are manual markdown, not auto-generated from OpenAPI/Swagger — intentional (D042) but means docs may drift from code as endpoints change. Runtime OpenAPI can be added later.

## Follow-ups

- Consider adding `@elysiajs/openapi` runtime endpoint for interactive API exploration (deferred per D042)
- Operator guide review by someone unfamiliar with the project (UAT human verification)
- Screen reader verification of dashboard accessibility (UAT human verification)
- Raise vitest coverage thresholds as coverage grows (D029 — current 60/50/55/60 below Codecov 70% target)

## Files Created/Modified

- `dashboard/package.json` — added vitest-axe and @axe-core/playwright devDependencies
- `dashboard/src/__tests__/setup.ts` — registered vitest-axe matchers via expect.extend
- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` — added aria-label="Refresh data"
- `dashboard/src/components/vendors/ModelList.tsx` — added aria-label="Remove model"
- `dashboard/src/components/layout/Sidebar.tsx` — added dynamic aria-label to collapse toggle
- `dashboard/src/components/policies/PolicyRow.tsx` — added aria-label to Switch (bonus a11y fix)
- `dashboard/src/__tests__/components/time-range-selector.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/sidebar.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/audit-filters.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/policy-row.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/route-error.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/route-loading.test.tsx` — added axe-core a11y assertion
- `dashboard/e2e/smoke.spec.ts` — added WCAG AA axe-core test case with AxeBuilder
- `docs/operator/guide.md` — 578-line comprehensive operator guide
- `docs/operator/troubleshooting.md` — 417-line troubleshooting reference (9 categories)
- `docs/api/rest.md` — 692-line REST API reference (13 modules, 53 endpoints)
- `docs/api/grpc.md` — 273-line gRPC API reference (2 proto services)
- `.gsd/PROJECT.md` — v1.5 Production Readiness section with 11 deliverable categories
- `README.md` — v1.5 status, Documentation section, enhanced Production Considerations
- `.gsd/STATE.md` — M007 marked complete

## Forward Intelligence

### What the next slice should know
- M007 is the final milestone in the current roadmap. All 8 slices are complete. The project is at v1.5 Production Readiness. Any future work would be a new milestone (M008+).
- The documentation suite (operator guide, troubleshooting, REST API, gRPC API, full-text-storage) is cross-referenced — changes to one doc should update cross-reference links in others.

### What's fragile
- Manual API docs (docs/api/rest.md, docs/api/grpc.md) will drift from code as endpoints change — no auto-generation mechanism exists. If endpoint signatures change, the docs must be manually updated.
- vitest-axe v0.1.0 has an empty `extend-expect` dist file — the workaround (`expect.extend(matchers)`) works but may need revisiting if the package updates.

### Authoritative diagnostics
- `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep "axe"` — shows all 6 a11y assertion results in one command
- `wc -l docs/operator/guide.md docs/operator/troubleshooting.md docs/api/rest.md docs/api/grpc.md` — documentation completeness signal

### What assumptions changed
- Originally planned 3 icon button a11y fixes — axe-core discovered a 4th (PolicyRow Switch) during test integration. Comprehensive axe-core scanning is more thorough than manual inspection for a11y gaps.
