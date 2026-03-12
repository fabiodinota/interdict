# Phase 30 Research: Secret, Session, and Seed Hardening

**Phase:** 30
**Name:** Secret, Session, and Seed Hardening
**Date:** 2026-03-11
**Status:** Complete

## Objective

Research how to implement Phase 30 well without widening scope beyond the approved boundary:

- remove plaintext API key reveal from the seed/bootstrap flow
- harden the dashboard login boundary with schema validation
- stop using the raw API key itself as the dashboard session cookie value
- preserve the existing BFF + httpOnly-cookie architecture

## Key Findings

### 1. The dashboard currently stores the raw API key as the session cookie

Current flow:

- `dashboard/src/app/api/auth/login/route.ts` validates an API key by calling `GET /api/v1/auth/me`
- on success, it sets `interdict_session=<raw_api_key>` in an httpOnly cookie
- `dashboard/src/app/api/auth/me/route.ts` reads that cookie and forwards it as `Authorization: Bearer {token}`
- `dashboard/src/app/api/auth/logout/route.ts` also forwards that same cookie value to `POST /api/v1/auth/logout`

This means the dashboard cookie is not a session token. It is the actual bearer credential.

### 2. The control-plane already has a secure opaque session-token model

Existing control-plane auth supports two token types:

- API keys: tokens prefixed with `ik_live_`
- opaque session tokens: everything else, looked up in the `sessions` table

Relevant existing capabilities:

- `control-plane/src/modules/auth/service.ts#createSession(userId)` already mints a cryptographically random opaque session token and stores only its SHA-256 hash
- `authenticateBySessionToken()` already validates those tokens
- SAML already uses this pattern through `exchangeSamlHandoffCode()`
- auth middleware already supports both API key and session token authentication with no route-level changes

This is the strongest planning signal in the phase: **Phase 30 should reuse the existing session-token model, not invent a new dashboard-local token scheme.**

### 3. Dashboard logout is currently weak for API-key logins

`dashboard/src/app/api/auth/logout/route.ts` calls `POST /api/v1/auth/logout` with the cookie value.

But control-plane logout does this:

- authenticates using the bearer token (API key or session token)
- always calls `revokeSession(rawToken)`

If the dashboard cookie contains an API key, logout authenticates successfully but revokes nothing in the `sessions` table. The cookie is cleared, but the API key remains valid.

This is a strong reason to exchange API-key login for a real session token.

### 4. The seed flow intentionally prints plaintext generated API keys to stdout

`control-plane/src/seed/run-seed.ts` currently prints generated keys when `SEED_SHOW_KEYS=true`.

That violates the project invariant against plaintext secrets in logs/stdout. The phase should remove stdout reveal entirely.

### 5. The dashboard login boundary is only manually validated

`dashboard/src/app/api/auth/login/route.ts` currently:

- calls `await request.json()` directly
- destructures `apiKey`
- performs only a manual `typeof apiKey === "string"` check

This is enough for happy-path correctness but not enough for a hardened API boundary. The phase should add typed/schema validation and explicit malformed-body handling.

## Recommended Implementation Direction

### Recommended auth/session approach

Add a new control-plane auth endpoint that exchanges a valid API key for a short-lived opaque session token.

Recommended flow:

1. Dashboard login route receives `{ apiKey }`
2. Dashboard route validates body with a schema
3. Dashboard calls a new control-plane endpoint such as `POST /api/v1/auth/session/exchange-api-key`
4. Control-plane authenticates the provided API key using the existing auth service
5. Control-plane mints an opaque session token via `createSession(user.id)`
6. Dashboard stores **that session token** in the httpOnly cookie
7. `/api/auth/me` and `/api/auth/logout` keep working, now using a real session token

Why this is the best fit:

- preserves the existing BFF + httpOnly-cookie model
- reuses the already-shipped secure session primitive
- fixes the logout weakness for API-key logins
- avoids inventing a dashboard-only token system
- satisfies `HR-AUTH-02` more cleanly than wrapping or shortening the API key

### Recommended login validation approach

Use explicit schema validation at the route boundary.

Good options:

1. `zod` in the dashboard route (ergonomic, common for Next route handlers)
2. a small route-local validation helper using an existing schema library if you want to avoid introducing `zod`

For planning, assume:

- malformed JSON returns `400`
- missing/non-string `apiKey` returns `400`
- invalid credentials return `401`

### Recommended seed hardening approach

Remove plaintext stdout logging entirely.

Preferred options, in order:

1. **Best minimal hardening:** do not print the raw keys at all; print only that keys were created and require retrieval through a separate secure bootstrap path
2. **If bootstrap usability must be preserved:** emit keys only to a secure one-time artifact outside stdout/logs, with explicit lifecycle/permission handling

For Phase 30 planning, option 1 is the safest and smallest unless current operator workflows prove a secure artifact is required immediately.

## Existing Code Patterns To Reuse

### Control-plane session model

- `control-plane/src/modules/auth/service.ts`
  - `createSession(userId)`
  - `authenticateBySessionToken(token)`
  - `revokeSession(rawToken)`

### Dual-mode auth middleware

- `control-plane/src/modules/auth/middleware.ts`
  - API key if token starts with `ik_live_`
  - session token otherwise

### Current dashboard BFF routes to update

- `dashboard/src/app/api/auth/login/route.ts`
- `dashboard/src/app/api/auth/me/route.ts`
- `dashboard/src/app/api/auth/logout/route.ts`
- `dashboard/src/lib/auth.ts`
- related API tests under `dashboard/src/__tests__/api/`

## Likely Files To Touch

### Control-plane

- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/auth/model.ts` (if request schema is added here)
- `control-plane/src/modules/auth/service.test.ts`
- possibly a new auth route test file if one exists or should be added
- `control-plane/src/seed/run-seed.ts`

### Dashboard

- `dashboard/src/app/api/auth/login/route.ts`
- `dashboard/src/app/api/auth/me/route.ts`
- `dashboard/src/app/api/auth/logout/route.ts`
- `dashboard/src/lib/auth.ts`
- `dashboard/src/__tests__/api/auth-login.test.ts`
- `dashboard/src/__tests__/api/auth-me.test.ts`
- `dashboard/src/__tests__/api/auth-logout.test.ts`

## Test Strategy

### Dashboard login route

Add/adjust tests for:

- malformed JSON body -> `400`
- missing `apiKey` -> `400`
- non-string `apiKey` -> `400`
- valid API key -> `200`, cookie contains opaque session token, not `ik_live_...`
- invalid API key -> `401`

### Dashboard me/logout routes

- `/api/auth/me` uses session token cookie and still returns profile
- `/api/auth/logout` revokes the session token and clears the cookie
- logout failure still clears the cookie but logs appropriately

### Control-plane auth exchange

- valid API key exchange -> returns opaque session token
- invalid API key exchange -> `401`
- service account vs human account behavior matches intended policy
- created session token authenticates through existing auth middleware

### Seed flow

- no test should assert or rely on plaintext API key stdout output
- if a secure bootstrap artifact is chosen, add tests around artifact generation and absence from logs/stdout

## Common Pitfalls

1. **Do not add a dashboard-local signed token wrapper around the raw API key.** That still preserves the raw credential as the real long-lived secret.
2. **Do not break SAML session behavior.** API-key exchange should reuse the same session primitive, not fork auth semantics.
3. **Do not widen scope into broader auth redesign.** This phase should harden current auth, not replace the whole identity model.
4. **Do not print secrets in fallback/error paths.** Removing the obvious stdout reveal is not enough if new errors accidentally expose raw tokens.
5. **Be careful with logout semantics.** Once API-key login becomes session-token login, logout should revoke the session token, not the underlying API key.

## Planning Guidance

This phase is best planned as 2-3 execution plans:

1. seed/bootstrap secret-output hardening
2. control-plane API-key -> session exchange contract
3. dashboard login/me/logout/session-cookie updates and tests

That split keeps security-sensitive changes small enough to verify while still preserving a coherent auth flow.