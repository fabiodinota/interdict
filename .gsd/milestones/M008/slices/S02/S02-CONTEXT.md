---
id: S02
milestone: M008
status: ready
---

# S02: Auth Hardening — Context

## Goal

Add rate limiting to auth endpoints, implement expired session/handoff cleanup, and write comprehensive SAML auth handler tests — closing the three auth-related high findings (H-02, H-03, H-04).

## Why this Slice

Auth is the highest-impact untested surface. SAML handlers (7KB, zero tests) are a security-critical code path with known vulnerability classes. Rate limiting is essential before any external-facing deployment. Session cleanup prevents database bloat on long-running instances. These three fixes are tightly coupled — they all touch the auth module and benefit from being implemented together.

## Scope

### In Scope

- In-memory per-IP rate limiter as Elysia middleware with configurable threshold and window
- Interval-based cleanup for expired sessions and handoff codes
- SAML test suite covering SSO initiation, ACS processing, signature verification, handoff code lifecycle, JIT provisioning, SLO, metadata, and error paths
- Rate limiter TTL-based eviction to prevent memory growth

### Out of Scope

- Redis-backed rate limiting (in-memory is sufficient for pilot scale)
- SAML integration tests against a real IdP
- Session table partitioning or archival

## Constraints

- Rate limiter must be in-memory with bounded memory (Map with TTL eviction)
- SAML tests must use mocked samlify responses, not a real IdP
- Session cleanup must not lock the database during deletion (batch deletes)
- All changes must pass existing `bun test` suite (308 tests)

## Integration Points

### Consumes

- `control-plane/src/modules/auth/index.ts` — Route definitions for rate limiting
- `control-plane/src/modules/auth/service.ts` — Session table queries for cleanup
- `control-plane/src/modules/auth/saml/handlers.ts` — SAML route handlers to test
- `control-plane/src/modules/auth/saml/config.ts` — SAML config to test
- `control-plane/src/db/schema/auth.ts` — Session and handoff_codes table schemas

### Produces

- `control-plane/src/modules/auth/rate-limiter.ts` — In-memory rate limiting middleware
- `control-plane/src/modules/auth/rate-limiter.test.ts` — Rate limiter tests
- `control-plane/src/modules/auth/cleanup.ts` — Session/handoff cleanup service
- `control-plane/src/modules/auth/cleanup.test.ts` — Cleanup tests
- `control-plane/src/modules/auth/saml/handlers.test.ts` — SAML handler tests
- `control-plane/src/modules/auth/saml/config.test.ts` — SAML config tests
