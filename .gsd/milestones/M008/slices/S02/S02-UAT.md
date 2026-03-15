# S02: Auth Hardening — Rate Limiting, Session Cleanup, SAML Tests — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All three components (rate limiter, cleanup, SAML tests) are fully exercised by automated tests. Rate limiter and cleanup are testable via unit tests with controlled time/state. SAML handlers are tested via mock-based Elysia apps. No live IdP or database required.

## Preconditions

- Node.js/Bun installed (`bun --version` returns ≥1.0)
- Working directory is repository root
- `cd control-plane && bun install` has been run

## Smoke Test

```bash
cd control-plane && bun test src/modules/auth/rate-limiter.test.ts src/modules/auth/cleanup.test.ts src/modules/auth/saml/handlers.test.ts src/modules/auth/saml/config.test.ts
```
**Expected:** ≥55 tests pass (12 + 11 + 25 + 7), 0 fail.

## Test Cases

### 1. Rate limiter blocks after threshold

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "blocks requests after maxRequests reached"
3. **Expected:** Test passes — `check()` returns `{ allowed: false }` after maxRequests calls within windowMs

### 2. Rate limiter returns 429 with Retry-After header

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "returns 429 with Retry-After header when rate limited"
3. **Expected:** Elysia integration test shows HTTP 429 response with `Retry-After` header value > 0

### 3. Rate limiter window reset

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "resets count after window expires"
3. **Expected:** After waiting windowMs, previously blocked IP is allowed again

### 4. Rate limiter IP isolation

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "isolates different IPs"
3. **Expected:** Blocking one IP does not affect requests from a different IP

### 5. Rate limiter TTL eviction

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "evictExpired removes only expired entries"
3. **Expected:** Expired entries removed, active entries preserved, evictionCount incremented

### 6. Rate limiter fails open on error

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "fails open when limiter throws"
3. **Expected:** Internal error → request allowed (not blocked), warning logged

### 7. Expired sessions deleted by cleanup

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check test "deletes expired sessions and returns count"
3. **Expected:** runCleanup() issues DELETE for sessions where expiresAt < NOW(), returns count of deleted rows

### 8. Active sessions preserved by cleanup

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check test "Active sessions are never touched (only expired rows deleted)"
3. **Expected:** Only expired rows targeted — WHERE clause uses `expiresAt < NOW()`, active sessions untouched

### 9. Handoff codes cleaned up

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check test "deletes expired handoff codes and returns count"
3. **Expected:** Expired handoff codes deleted in same cleanup pass

### 10. Cleanup interval with graceful shutdown

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check tests "stop() clears the interval" and "stop() is idempotent"
3. **Expected:** stop() prevents further cleanup ticks; calling stop() twice is safe

### 11. Cleanup error resilience

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check test "logs error when cleanup fails and continues running"
3. **Expected:** DB error logged with `[auth-cleanup]` prefix, service continues running

### 12. SAML SSO redirect

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "redirects to IdP with login request"
3. **Expected:** GET /saml/sso returns 302 redirect to IdP URL with SAMLRequest parameter

### 13. SAML ACS valid assertion

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "creates handoff code and redirects to dashboard on valid assertion"
3. **Expected:** POST /saml/acs with valid SAMLResponse → 302 redirect to DASHBOARD_URL with handoff code parameter

### 14. SAML ACS invalid assertion

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "returns 401 when parseLoginResponse throws"
3. **Expected:** Invalid/expired SAML assertion → 401 response

### 15. SAML handoff code exchange

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "valid code returns session token"
3. **Expected:** POST /saml/exchange-code with valid handoff code → session token in response

### 16. SAML handoff code replay prevention

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "replay prevention: second exchange returns 410"
3. **Expected:** Second exchange of same code → 410 Gone

### 17. SAML handoff code expiry

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "expired code returns 410 with CODE_EXPIRED"
3. **Expected:** Code older than TTL → 410 with CODE_EXPIRED error code

### 18. SAML JIT user provisioning

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check tests "new user is created from SAML attributes" and "existing user's externalId is updated"
3. **Expected:** New user created from SAML nameID/email/displayName; existing user updated on re-login

### 19. SAML SLO

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check tests for SLO redirect and cookie clearing
3. **Expected:** GET /saml/slo → redirect to IdP SLO URL; session cookie cleared

### 20. SAML metadata endpoint

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "returns XML metadata with correct content type"
3. **Expected:** GET /saml/metadata → XML response with `application/xml` content type

### 21. Disabled SAML returns 404

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check tests "SSO returns 404", "ACS returns 404", "metadata returns 404"
3. **Expected:** All three SAML routes return 404 when samlEnabled=false

### 22. SAML config disabled when certs missing

1. Run `bun test src/modules/auth/saml/config.test.ts`
2. Check tests for missing cert files
3. **Expected:** samlEnabled=false when SP cert, SP key, or IdP metadata files don't exist

### 23. SAML config throws on missing env vars

1. Run `bun test src/modules/auth/saml/config.test.ts`
2. Check tests for missing SAML_SP_BASE_URL and SAML_SP_ENTITY_ID
3. **Expected:** Module throws when certs are present but required env vars are missing

### 24. SAML config enabled with all prerequisites

1. Run `bun test src/modules/auth/saml/config.test.ts`
2. Check test "samlEnabled = true when all files and env vars present"
3. **Expected:** samlEnabled=true, SP and IdP objects initialized

### 25. Full suite regression check

1. Run `cd control-plane && bun test`
2. **Expected:** ≥363 tests pass. Only 2 pre-existing failures in service.test.ts (exchangeApiKeyForSession ordering issue). No new failures.

## Edge Cases

### Rate limiter x-forwarded-for extraction

1. Run `bun test src/modules/auth/rate-limiter.test.ts`
2. Check test "uses x-forwarded-for header for IP identification"
3. **Expected:** First IP in x-forwarded-for chain used for rate tracking (proxy-aware)

### SAML ACS email extraction fallbacks

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check tests for empty nameID email fallback and email-prefix displayName fallback
3. **Expected:** Email extracted from attributes when nameID is empty; email prefix used as displayName when attribute missing

### SAML ACS array-valued attributes

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "handles array-valued SAML attributes"
3. **Expected:** First element extracted from array-valued SAML attribute fields

### SAML ACS non-Error thrown values

1. Run `bun test src/modules/auth/saml/handlers.test.ts`
2. Check test "handles non-Error thrown values"
3. **Expected:** String or non-Error thrown from parseLoginResponse → 401 without crash

### Cleanup batch size enforcement

1. Run `bun test src/modules/auth/cleanup.test.ts`
2. Check test "batch size limits the number of deletes (simulated)"
3. **Expected:** LIMIT clause in SQL uses configured batchSize value

## Failure Signals

- Any of the 55 new tests failing in `bun test` indicates a regression
- New failures in other test files (beyond the 2 pre-existing service.test.ts failures) indicate unintended side effects
- Rate limiter test "fails open when limiter throws" failing would indicate the fail-open safety net is broken
- Config subprocess tests timing out may indicate Windows-specific path resolution issues

## Requirements Proved By This UAT

- AR-AUTH-01 — Rate limiter returns 429 after configurable threshold, with TTL eviction and fail-open safety
- AR-AUTH-02 — SAML handlers have 32 test cases covering all route paths and error conditions
- AR-AUTH-03 — Expired session/handoff cleanup proven with interval execution, batch limiting, and graceful shutdown

## Not Proven By This UAT

- Multi-replica rate limiting behavior (in-memory limiter is per-process)
- Real database cleanup execution (tests use FakeDb doubles)
- Real SAML IdP interaction (tests use mocked samlify)
- Production load characteristics of rate limiter under high concurrency

## Notes for Tester

- The 2 pre-existing service.test.ts failures are a known test-ordering issue — ignore them
- Config tests spawn subprocesses and may take ~2-3 seconds total due to Bun startup time per test
- Rate limiter tests with timing (`window reset`) use 94ms sleeps — increase if running on slow CI
- `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_MS` env vars can override defaults in production
