---
id: S07
milestone: M008
status: ready
---

# S07: Code Quality & Dashboard Fixes — Context

## Goal

Fix all low-severity code quality findings: dead code removal, console.error sanitization, cookie secure flag decoupling, ClickHouse password warning, interdict-verify unwrap fix, and test `as any` removal.

## Why this Slice

These are individually small fixes that together eliminate all LOW-severity findings in application code. Each is a 5-15 minute fix. Batching them into one slice is more efficient than spreading across multiple slices.

## Scope

### In Scope

- L-01: Remove dead code in `auth-client.ts` (httpOnly cookie can't be cleared client-side)
- L-02: Sanitize `console.error` in `RouteError.tsx` for production
- L-03: Add ClickHouse password warning when empty in production mode
- L-05: Remove `as any` from audit-table.test.tsx
- L-12: Replace production unwrap in interdict-verify/main.rs
- M-01: Decouple cookie `secure` flag from NODE_ENV — make independently configurable
- M-03: Document CSRF posture (not fixing — `sameSite: lax` is sufficient for pilot)

### Out of Scope

- Adding CSRF tokens (sufficient for current deployment model)
- Refactoring error boundary patterns
- ClickHouse auth infrastructure changes

## Constraints

- Cookie secure flag must maintain backward compatibility (default behavior unchanged)
- interdict-verify unwrap fix must not change error reporting behavior
- All existing tests must continue to pass

## Integration Points

### Consumes

- `dashboard/src/lib/auth-client.ts` — Client-side logout code
- `dashboard/src/lib/auth.ts` — Cookie configuration
- `dashboard/src/components/layout/RouteError.tsx` — Error boundary
- `control-plane/src/config.ts` — ClickHouse config
- `crates/interdict-verify/src/main.rs` — CLI tool
- `dashboard/src/__tests__/components/audit-table.test.tsx` — Test file

### Produces

- Cleaned auth-client.ts (dead code removed)
- Production-safe RouteError.tsx (error details hidden in production)
- Configurable cookie secure flag via `COOKIE_SECURE` env var
- ClickHouse password warning at startup
- interdict-verify with proper error handling
- Type-safe audit-table test
