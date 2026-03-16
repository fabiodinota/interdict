---
estimated_steps: 5
estimated_files: 2
---

# T01: Add BFF proxy path allowlist and body size cap

**Slice:** S02 — Security Hardening — Proxy, Helm, Secrets
**Milestone:** M009

## Description

The BFF proxy (`dashboard/src/app/api/proxy/[...path]/route.ts`) currently forwards any path to the control plane at `/api/v1/<path>` with zero validation. This is assessment finding H-03 — a high-risk path traversal vector. Additionally, there's no body size limit on proxied requests.

Add a path allowlist that matches the first segment of the target path against known control-plane API module prefixes, returning 403 for disallowed paths. Add a 2MB body size cap via `Content-Length` header inspection, returning 413 for oversized requests.

## Steps

1. **Define allowed path prefixes.** Add a constant array at the top of `route.ts`:
   ```typescript
   const ALLOWED_PATH_PREFIXES = [
     "auth",
     "policies",
     "vendors",
     "regulatory",
     "audit",
     "reports",
     "admin",
     "evidence",
     "reviews",
     "department-overrides",
     "anomalies",
   ] as const;
   ```
   Note: `admin` covers `admin/signing-keys` — the check is on the first segment only.

2. **Define body size limit constant:**
   ```typescript
   const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB
   ```

3. **Add path validation in `proxyRequest` function.** After `const targetPath = path.join("/");` and before URL construction:
   ```typescript
   const firstSegment = path[0];
   if (!firstSegment || !ALLOWED_PATH_PREFIXES.includes(firstSegment as any)) {
     return NextResponse.json(
       { success: false, error: { message: "Forbidden" } },
       { status: 403 },
     );
   }
   ```

4. **Add body size validation.** For methods that can have a body (POST, PUT, PATCH), check `Content-Length` header after the path check but before forwarding:
   ```typescript
   const contentLength = request.headers.get("content-length");
   if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
     return NextResponse.json(
       { success: false, error: { message: "Request body too large", maxBytes: MAX_BODY_SIZE } },
       { status: 413 },
     );
   }
   ```
   Apply this check only for methods that read the body (POST, PUT, DELETE handlers). GET and the SSE streaming path don't have request bodies. Note: missing `Content-Length` is allowed — streaming/chunked requests may not have it.

5. **Add tests in `proxy.test.ts`.** Add a new `describe("Path allowlist")` block and `describe("Body size limit")` block:
   - Test: disallowed path (e.g., `["evil", "path"]`) returns 403 with `{ success: false, error: { message: "Forbidden" } }`
   - Test: empty path (`[]`) returns 403
   - Test: each core allowed prefix succeeds (at least `"policies"`, `"auth"`, `"evidence"`, `"admin"`)
   - Test: nested allowed path (e.g., `["policies", "123", "compile"]`) succeeds (proves prefix matching, not exact matching)
   - Test: POST with `Content-Length` > 2MB returns 413
   - Test: POST with `Content-Length` exactly at 2MB succeeds
   - Test: POST without `Content-Length` header succeeds (streaming case)
   - Test: GET requests don't check body size

## Must-Haves

- [ ] `ALLOWED_PATH_PREFIXES` array contains all 11 control-plane module prefixes
- [ ] Disallowed paths return 403 before any URL construction or fetch call
- [ ] Body over 2MB returns 413 with structured error including `maxBytes`
- [ ] All 18 existing proxy tests still pass
- [ ] At least 7 new tests covering allowlist and body cap boundaries

## Verification

- `npx vitest run` — all dashboard tests pass
- `npx vitest run dashboard/src/__tests__/api/proxy.test.ts` — proxy-specific tests pass, count is ≥25 (18 existing + 7+ new)

## Observability Impact

- **New signal:** HTTP 403 response for disallowed proxy paths (structured JSON with `{ success: false, error: { message: "Forbidden" } }`). HTTP 413 for oversized bodies (includes `maxBytes` field for diagnostics).
- **How to inspect:** Send a request to `/api/proxy/evil/path` — should get 403. Send a POST with `Content-Length: 3000000` — should get 413 with `maxBytes: 2097152`.
- **Failure visibility:** Blocked requests never reach the upstream control plane — no upstream fetch is made. The 403/413 is returned early in `proxyRequest`, before URL construction.
- **No secrets involved:** The allowlist checks path segments only. Body size check reads the `Content-Length` header value, never the body content.

## Inputs

- `dashboard/src/app/api/proxy/[...path]/route.ts` — current proxy implementation (121 lines, zero path validation). Exports: `GET`, `POST`, `PUT`, `DELETE`. Uses `proxyRequest` helper that builds URL as `${controlPlaneUrl}/api/v1/${targetPath}`. Has special SSE streaming branch for `audit/stream`.
- `dashboard/src/__tests__/api/proxy.test.ts` — existing 18 test cases covering auth, method forwarding, headers, cookies, search params, SSE streaming, error handling. Uses `buildNextRequest`, `jsonResponse`, `mockFetch` from `../helpers/next-mocks`. Mock setup: `getSessionToken` returns `mockToken`, `getControlPlaneUrl` returns `"http://control-plane:3000"`.
- Control-plane API route prefixes (from research): auth, policies, vendors, regulatory, audit, reports, admin/signing-keys, evidence, reviews, department-overrides, anomalies.

## Expected Output

- `dashboard/src/app/api/proxy/[...path]/route.ts` — updated with `ALLOWED_PATH_PREFIXES` constant, path validation before URL construction, and `Content-Length` body cap check
- `dashboard/src/__tests__/api/proxy.test.ts` — expanded with ≥7 new tests covering allowlist and body cap boundaries
