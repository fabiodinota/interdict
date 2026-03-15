# S08: Documentation, Accessibility & Polish — Research

**Date:** 2026-03-15

## Summary

S08 closes the final three gaps in M007: operator documentation, dashboard accessibility, and project tracking updates. The codebase has strong structural foundations — ARIA landmarks (`<main>`, `<nav>`, `<header>`, `<aside>`) are correctly placed, route modules have TypeBox schemas ready for OpenAPI auto-generation, and proto files are well-commented. The main work is *creation* of documentation artifacts and *integration* of accessibility tooling, not restructuring existing code.

The biggest leverage comes from Elysia's first-party `@elysiajs/openapi` plugin, which can auto-generate the OpenAPI spec from existing TypeBox route schemas across all 12 API modules (51 endpoints). For accessibility, `vitest-axe` provides component-level axe-core assertions in the existing vitest test infrastructure, while `@axe-core/playwright` enables page-level WCAG AA validation in the existing Playwright E2E smoke test. A handful of icon buttons are missing `aria-label` attributes — these are surgical fixes.

## Recommendation

**Split into 5 tasks:**

1. **T01: Operator Guide** — Create comprehensive `docs/operator/guide.md` covering deployment (Docker Compose + Helm), configuration (env vars from `env.example`), certificate management, key rotation, monitoring (`--profile monitoring`), backup (`scripts/backup.sh`), environment validation (`scripts/validate-env.sh`), and upgrade procedures. Reference existing `docs/operator/full-text-storage.md`.

2. **T02: API Documentation (OpenAPI + gRPC)** — Install `@elysiajs/openapi` and wire it into the control-plane Elysia app for auto-generated OpenAPI docs at `/api/docs`. Create `docs/api/grpc.md` documenting the 2 proto service definitions. Create `docs/api/rest.md` as a human-readable API reference covering all 12 modules.

3. **T03: Troubleshooting Guide** — Create `docs/operator/troubleshooting.md` covering common failure modes: certificate issues (mTLS, CA trust), database connectivity, evidence pipeline failures, policy distribution errors, signing key rotation, CSP violations, and deployment-specific issues.

4. **T04: Dashboard Accessibility (WCAG AA)** — Install `vitest-axe` and add axe-core assertions to existing component tests. Install `@axe-core/playwright` and add WCAG AA validation to the Playwright smoke test. Fix identified a11y issues: missing `aria-label` on icon buttons (TimeRangeSelector refresh, ModelList delete, Sidebar collapse toggle), and any violations axe-core surfaces.

5. **T05: Project Tracking Updates** — Update `PROJECT.md` to reflect v1.5 status. Update `CHANGELOG.md` with M007 changes. Update `README.md` deployment section to reference new docs. Verify all milestone slices are marked complete.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| OpenAPI spec generation | `@elysiajs/openapi` (Elysia first-party plugin) | Auto-generates from existing TypeBox schemas — 51 endpoints already typed |
| Component-level a11y testing | `vitest-axe` v0.1.0 | Integrates axe-core into existing vitest setup — `toHaveNoViolations()` matcher |
| Page-level a11y testing | `@axe-core/playwright` v4.11.1 | Integrates axe-core into existing Playwright E2E — `AxeBuilder(page).analyze()` |
| Swagger UI | `@elysiajs/openapi` includes Scalar UI | No separate Swagger UI setup needed |
| gRPC documentation | Proto files are self-documenting | Comments already describe all RPCs and messages — render as markdown |

## Existing Code and Patterns

- `docs/operator/full-text-storage.md` — Existing 163-line operator doc; follow this structure and voice for new docs
- `control-plane/src/modules/*/model.ts` — TypeBox type definitions for request/response schemas; 12 model files with rich schema definitions that `@elysiajs/openapi` auto-discovers
- `control-plane/src/modules/*/index.ts` — Elysia route definitions with `body:`, `query:`, `params:` type annotations on 51 endpoints
- `proto/interdict/evidence/v1/evidence.proto` — EvidenceCollectorService with SubmitEvidence streaming RPC + EvidenceBundle message
- `proto/interdict/policy/v1/policy_distribution.proto` — PolicyDistributionService with Subscribe server-stream + Acknowledge RPC
- `env.example` — 201-line comprehensive env config with comments; use as source of truth for operator guide configuration section
- `dashboard/src/app/layout.tsx` — Root layout already has `<html lang="en">`, nonce-based CSP, Inter font
- `dashboard/src/app/(dashboard)/layout.tsx` — Dashboard layout uses `<main>`, `<aside>` (Sidebar), `<header>` (TopBar), `<nav>` landmarks — all correct
- `dashboard/src/__tests__/setup.ts` — Test setup imports `@testing-library/jest-dom/vitest`; extend with vitest-axe matchers here
- `dashboard/playwright.config.ts` — Playwright config with "smoke" project; add a11y project or extend smoke tests
- `dashboard/e2e/smoke.spec.ts` — 3 existing smoke tests; add WCAG AA assertion here
- `scripts/backup.sh` — Backup script with `--dry-run` and `--output-dir` support; document in operator guide
- `scripts/validate-env.sh` — Pre-flight env validation; document in operator guide
- `scripts/smoke-test.sh` — Full-stack smoke test; document in operator guide
- `docker-compose.monitoring.yml` — Monitoring overlay with Prometheus + Grafana; document `--profile monitoring` usage
- `helm/interdict/values.yaml` — Helm values with NetworkPolicy, startupProbe, service configs; reference in operator guide
- `.gsd/PROJECT.md` — Currently reflects v1.2; needs update to v1.5

## Constraints

- **Elysia version pinned at 1.4.26** — `@elysiajs/openapi` must be compatible with this version. The docs show it's the current approach (`bun add @elysiajs/openapi`).
- **happy-dom test environment** — vitest-axe runs axe-core against DOM; happy-dom may have limitations vs jsdom for a11y analysis. axe-core disables color-contrast checks in virtual DOMs by default (acceptable — CSP/visual checks are browser-level).
- **No `middleware.ts` alongside `proxy.ts`** — Next.js 16 pattern (D035/S06 forward intel). Must not create middleware.ts for any a11y middleware.
- **Playwright not yet in CI** — S04 created the config but S05 did not add a CI job. A11y Playwright tests run locally or via smoke-test.sh. If CI integration is wanted, that's out of scope.
- **Component tests mock Radix primitives** — vitest-axe assertions on mocked components will have limited a11y fidelity. Focus axe-core assertions on simple/medium components where DOM is real, and use Playwright for full-page validation.
- **gRPC services don't have OpenAPI** — gRPC uses proto definitions, documented manually. No auto-generation tool needed.

## Common Pitfalls

- **vitest-axe + happy-dom false negatives** — happy-dom doesn't fully implement CSSOM, so color-contrast and focus-visible checks won't fire. Disable these rules in vitest-axe config; rely on Playwright for browser-level WCAG. Don't claim "zero violations" based on vitest-axe alone.
- **@elysiajs/openapi version mismatch** — Elysia 1.4.x uses `@elysiajs/openapi` (not the older `@elysiajs/swagger`). Check compatibility before installing. The plugin name changed from `swagger` to `openapi` in recent versions.
- **Mocked components hide a11y issues** — S04 mocks Radix Dialog, Sheet, Select, Popover, and Tooltip with div stubs. axe-core on these mocked trees won't catch real portal/focus-trap issues. Accept this limitation for unit tests; Playwright catches portal issues at page level.
- **Operator guide scope creep** — The guide should document *what exists*, not aspirational features. Cover only deployed capabilities from S01–S07.
- **CHANGELOG duplication with release-please** — release-please (S05) auto-generates changelogs from conventional commits. The manual CHANGELOG.md should document milestone-level changes, not individual commits. Keep them complementary.

## Open Risks

- **`@elysiajs/openapi` compatibility with Elysia 1.4.26** — The plugin is actively maintained but breaking changes between minor versions are possible. If incompatible, fall back to a hand-written OpenAPI spec (YAML) in `docs/api/openapi.yaml`. Low risk — Elysia's own docs show this as the standard approach.
- **vitest-axe maintenance** — v0.1.0 is a young package (forked from jest-axe). If it fails with the current vitest version, fall back to using `axe-core` directly via `axe.run()` in tests. The axe-core engine itself is v4.11.1 and rock-solid.
- **Icon button a11y fixes may break existing tests** — Adding `aria-label` to components that S04 tests assert on could change `getByRole` query results. Review affected tests after fixes.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| OpenAPI | `wshobson/agents@openapi-spec-generation` | available (3.6K installs) — likely overkill since Elysia has first-party plugin |
| OpenAPI | `github/awesome-copilot@openapi-to-application-code` | available (7K installs) — wrong direction (we generate spec, not consume it) |
| axe-core/a11y | none found | no dedicated skill — axe-core docs are sufficient |
| Elysia | none found | `@elysiajs/openapi` plugin docs are comprehensive |

**Recommendation:** No skills need installation. The Elysia first-party plugin and axe-core libraries have excellent documentation. The `openapi-spec-generation` skill targets general APIs, not Elysia's auto-generation pattern.

## Sources

- Elysia `@elysiajs/openapi` plugin auto-generates OpenAPI V3 with Scalar UI (source: [ElysiaJS OpenAPI docs](https://elysiajs.com/patterns/openapi))
- `vitest-axe` v0.1.0 provides `toHaveNoViolations()` matcher for vitest (source: [npm registry](https://www.npmjs.com/package/vitest-axe))
- `@axe-core/playwright` v4.11.1 integrates axe-core into Playwright for page-level WCAG validation (source: [npm registry](https://www.npmjs.com/package/@axe-core/playwright))
- axe-core recommends disabling `color-contrast` rule in virtual DOM environments like JSDOM/happy-dom (source: [axe-core JSDOM example](https://github.com/dequelabs/axe-core))
- Elysia 1.4.x uses TypeBox schemas from `model.ts` files for automatic OpenAPI spec generation — all 12 API modules already have typed body/query/params

## Requirements Owned by This Slice

| Requirement | Status | This Slice's Role |
|-------------|--------|-------------------|
| PR-OPS-01 | active | **Primary owner** — Create operator guide, API docs, troubleshooting guide |
| PR-A11Y-01 | active | **Primary owner** — Dashboard passes axe-core with zero critical/serious WCAG violations |
| HR-DOC-01 | validated | **Supports** — Update project tracking docs to reflect verified state |

## Identified A11y Issues (Pre-Scan)

| Component | Issue | Fix |
|-----------|-------|-----|
| `TimeRangeSelector.tsx` L78 | Refresh icon button missing `aria-label` | Add `aria-label="Refresh data"` |
| `ModelList.tsx` L111 | Delete model icon button missing `aria-label` | Add `aria-label="Remove model"` |
| `Sidebar.tsx` collapse toggle | Icon-only state has no accessible name | Add `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}` |
| `theme-toggle.tsx` L21 | Has `sr-only` span — ✅ already accessible | No fix needed |
| `AuditFilters.tsx` L198 | Has `title="Clear filters"` — ✅ already accessible | No fix needed |
| `PolicyRow.tsx` L92, L101 | Has `aria-label` — ✅ already accessible | No fix needed |
| `RuleEditor.tsx` L197 | Has `aria-label` — ✅ already accessible | No fix needed |

## API Surface Summary (for OpenAPI docs)

| Module | Prefix | Endpoints | Has TypeBox Schema |
|--------|--------|-----------|-------------------|
| auth | `/api/v1/auth` | 7 | Yes (model.ts) |
| policies | `/api/v1/policies` | 7 | Yes (model.ts) |
| compiler | `/api/v1/policies` | 1 | Yes (index.ts) |
| vendors | `/api/v1/vendors` | 8 | Yes (model.ts) |
| regulatory | `/api/v1/regulatory` | 6 | Yes (model.ts) |
| audit | `/api/v1/audit` | 5 | Yes (model.ts) |
| reports | `/api/v1/reports` | 1 | Yes (model.ts) |
| signing-keys | `/api/v1/admin/signing-keys` | 4 | No (inline) |
| evidence | `/api/v1/evidence` | 2 | Yes (model.ts) |
| reviews | `/api/v1/reviews` | 5 | Yes (model.ts) |
| department-overrides | `/api/v1/department-overrides` | 4 | Yes (model.ts) |
| anomalies | `/api/v1/anomalies` | 2 | Yes (model.ts) |
| health | `/health` | 1 | No (inline) |
| **Total** | | **53** | **11/13 modules typed** |

## gRPC Service Summary (for proto docs)

| Service | Proto File | RPCs |
|---------|-----------|------|
| EvidenceCollectorService | `proto/interdict/evidence/v1/evidence.proto` | `SubmitEvidence` (client-stream) |
| PolicyDistributionService | `proto/interdict/policy/v1/policy_distribution.proto` | `Subscribe` (server-stream), `Acknowledge` (unary) |

## Documentation Structure Plan

```
docs/
├── operator/
│   ├── guide.md                # Comprehensive operator guide (new)
│   ├── troubleshooting.md      # Troubleshooting guide (new)
│   └── full-text-storage.md    # Existing (S06)
├── api/
│   ├── rest.md                 # REST API reference (new)
│   └── grpc.md                 # gRPC API reference (new)
```
