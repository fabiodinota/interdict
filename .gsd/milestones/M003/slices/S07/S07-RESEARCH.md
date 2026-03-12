# Phase 22: Dashboard Reliability and Operator Trust — Research

**Date:** 2026-03-10

## Summary

The dashboard is the operator's primary trust surface. Zero test coverage meant any change to the BFF proxy, auth flow, or evidence verification UI was a blind refactor. The BFF proxy is particularly critical — it mediates all operator requests to internal services and enforces auth.

## Decisions

- vitest chosen as test runner (aligns with Vite-based dashboard build)
- @testing-library/react + happy-dom for component testing (no browser required)
- @vitejs/plugin-react for JSX transform in tests
- BFF proxy route tested as first priority (16 tests): auth guard, Bearer token forwarding, URL construction, SSE streaming, binary passthrough, upstream error handling
- Auth login tested (6 tests): validation, key verification, httpOnly cookie, error paths
- Auth logout tested (3 tests): server-side revocation
- Evidence verification UI tested for pass/fail/partial states
- 62 tests total across 8 test files