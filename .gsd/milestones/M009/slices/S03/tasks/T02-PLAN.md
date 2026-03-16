# T02: Fix SAML SLO to revoke server session before cookie clear

## Description

The SAML Single Logout handler clears the session cookie but doesn't revoke the session row in Postgres — a copied token could still authenticate until TTL expiry. Fix by extracting the session token from the cookie, calling `authService.revokeSession()`, then proceeding with cookie clear + redirect. Also removes the dead `_SESSION_MAX_AGE_SECONDS` constant.

## Slice Context

**Goal:** SAML SLO revokes server session before IdP redirect. Dead code removed.

**Verification:** `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts` passes with new SLO revocation test.

## Steps

1. **Remove `_SESSION_MAX_AGE_SECONDS` from `control-plane/src/modules/auth/saml/handlers.ts`:**
   - Line 30: `const _SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours`
   - This constant is unused — session TTL is managed by `createSession` in `service.ts`.
   - Delete the line entirely.

2. **Fix the SLO handler in `handlers.ts`:**
   - The SLO handler is `.get("/slo", async (rawCtx) => { ... })` at approximately line 160.
   - Currently destructures only `{ cookie, redirect }` from `rawCtx`.
   - Expand to also get `store`: `const { cookie, redirect, store } = rawCtx as { cookie: Record<string, { value?: string; set: (opts: Record<string, unknown>) => void }>; redirect: (url: string) => Response; store: { db?: typeof pgDb } };`
   - Before the existing cookie clear logic, add session revocation:
     ```typescript
     // Revoke server-side session before clearing cookie
     const sessionToken = cookie[SESSION_COOKIE_NAME]?.value;
     if (sessionToken) {
       try {
         const db = store.db ?? pgDb;
         const authService = createAuthService(db);
         await authService.revokeSession(sessionToken);
       } catch (err) {
         console.warn(
           `[saml] SLO session revocation failed: ${err instanceof Error ? err.message : String(err)}`
         );
         // Continue with cookie clear + redirect even if revocation fails
       }
     }
     ```
   - The `createAuthService` import already exists at the top of the file (used by ACS handler).
   - The rest of the handler (cookie clear, IdP SLO redirect) stays unchanged.

3. **Add SLO revocation test in `control-plane/src/modules/auth/saml/handlers.test.ts`:**
   - The file has 25 handler tests + 7 config tests. Match the existing test style.
   - Add test: **"SLO revokes server session before clearing cookie"**
     - Need to test that when a request hits GET `/slo` with a session cookie, `revokeSession` is called with the token value.
     - Check how existing tests mock the database/authService. The ACS handler tests likely show the pattern for mocking `store.db` and the auth service.
     - The test should:
       1. Set up SAML as enabled (follow existing test setup pattern)
       2. Create an Elysia app with `createSamlRoutes()` mounted
       3. Make a GET request to `/saml/slo` with a cookie header: `Cookie: interdict_session=test-session-token`
       4. Assert the response redirects (302 or similar) to either IdP SLO URL or dashboard login
       5. Assert `revokeSession` was called with `"test-session-token"`
     - If mocking `createAuthService` is complex, an alternative approach: mock the `sessions` table delete directly and assert it was called with the hashed token.
   - Also verify `_SESSION_MAX_AGE_SECONDS` is gone: `rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/` → 0 results.

## Must-Haves

- `revokeSession(token)` called before cookie clear in SLO handler
- Session revocation failure doesn't break SLO flow (try/catch with warn log)
- `_SESSION_MAX_AGE_SECONDS` constant removed
- New test proves revocation is called with correct token value
- All 32 existing SAML tests still pass

## Verification

```bash
cd control-plane && bun test src/modules/auth/saml/handlers.test.ts
```

All existing + new tests pass.

```bash
rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/
```

Returns zero hits.

## Inputs

- `control-plane/src/modules/auth/saml/handlers.ts` — SLO handler at ~line 160
- `control-plane/src/modules/auth/service.ts` — `revokeSession(rawToken)` method at ~line 447
- `control-plane/src/modules/auth/saml/handlers.test.ts` — existing 32 tests
- `SESSION_COOKIE_NAME` constant = `"interdict_session"` (line ~29 of handlers.ts)

## Expected Output

- SLO handler revokes session before cookie clear
- `_SESSION_MAX_AGE_SECONDS` removed
- 1+ new passing test for SLO revocation
- All 32 existing tests still pass
