# Phase 22: Dashboard Reliability and Operator Trust — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

The dashboard had zero automated tests. The BFF proxy route — the trust boundary between operator browser sessions and internal services — was completely untested. Evidence verification UI states (pass/fail/partial/error) had no coverage. Any refactoring was high-risk.

## Scope

- Set up vitest + @testing-library/react + happy-dom + @vitejs/plugin-react
- Add BFF proxy route tests (auth guard, Bearer token, URL construction, SSE streaming, binary passthrough, upstream errors)
- Add auth login/logout tests
- Add evidence verification UI state tests
- Achieve coverage for all trust-sensitive dashboard flows

## Key Files

- `dashboard/vitest.config.ts`
- `dashboard/src/app/api/proxy/[...path]/__tests__/route.test.ts`
