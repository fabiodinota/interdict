---
id: T01
parent: S02
milestone: M009
provides:
  - BFF proxy path allowlist (11 control-plane module prefixes)
  - BFF proxy 2MB body size cap via Content-Length inspection
key_files:
  - dashboard/src/app/api/proxy/[...path]/route.ts
  - dashboard/src/__tests__/api/proxy.test.ts
key_decisions:
  - Body size check uses Content-Length header only — missing header is allowed for streaming/chunked requests
  - Path check matches first segment only, so "admin" covers "admin/signing-keys"
patterns_established:
  - Early-return guard pattern: validate path → validate body size → construct URL → forward
observability_surfaces:
  - HTTP 403 with structured JSON { success: false, error: { message: "Forbidden" } } for disallowed paths
  - HTTP 413 with structured JSON { success: false, error: { message: "Request body too large", maxBytes: 2097152 } } for oversized bodies
duration: 20m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Add BFF proxy path allowlist and body size cap

**Proxy now rejects disallowed paths with 403 and oversized bodies with 413 before any upstream forwarding.**

## What Happened

Added `ALLOWED_PATH_PREFIXES` constant with all 11 control-plane module prefixes (auth, policies, vendors, regulatory, audit, reports, admin, evidence, reviews, department-overrides, anomalies). Path validation extracts the first segment and checks against the allowlist — returning 403 before URL construction or fetch for disallowed paths.

Added `MAX_BODY_SIZE` constant (2MB). For non-GET/HEAD methods, the proxy inspects the `Content-Length` header and returns 413 with a structured error including `maxBytes` for oversized requests. Missing `Content-Length` is intentionally allowed for streaming/chunked requests.

Both guards execute after auth but before URL construction, ensuring rejected requests never touch the upstream control plane.

## Verification

- `npx vitest run src/__tests__/api/proxy.test.ts` — 31 tests pass (18 existing + 13 new)
- `npx vitest run` — all 400 dashboard tests pass across 53 files
- Path allowlist tests: disallowed prefix → 403, empty path → 403, 4 known prefixes succeed, nested path under prefix succeeds, hyphenated prefix succeeds, path traversal attempt → 403
- Body size tests: POST >2MB → 413, POST exactly 2MB → succeeds, POST without Content-Length → succeeds, GET with large Content-Length → not checked, PUT >2MB → 413, DELETE >2MB → 413

### Slice-level verification (T01 scope):

- ✅ `npx vitest run` — all dashboard tests pass including new proxy allowlist (403) and body cap (413) tests
- ⬜ `bun test` — not applicable to T01 (control-plane tests, T03 scope)
- ⬜ `helm lint helm/interdict` — not applicable to T01 (T02 scope)
- ⬜ `helm template` checks — not applicable to T01 (T02 scope)
- ⬜ `docker compose config` checks — not applicable to T01 (T03 scope)
- ⬜ `rg "readOnly: true"` — not applicable to T01 (T02 scope)
- ⬜ `rg "127\.0\.0\.1:"` — not applicable to T01 (T03 scope)

## Diagnostics

- Send GET to `/api/proxy/evil/path` — returns 403 `{ success: false, error: { message: "Forbidden" } }`
- Send POST to `/api/proxy/policies` with `Content-Length: 3000000` — returns 413 with `maxBytes: 2097152`
- Rejected requests never call upstream fetch — verify with network monitoring

## Deviations

- Test for oversized bodies required setting `Content-Length` header after Request construction — happy-dom's Request constructor normalizes Content-Length from actual body size. Tests set the header post-construction to simulate spoofed/large headers.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/app/api/proxy/[...path]/route.ts` — added ALLOWED_PATH_PREFIXES, MAX_BODY_SIZE, path validation guard, body size guard
- `dashboard/src/__tests__/api/proxy.test.ts` — added 13 tests in "Path allowlist" and "Body size limit" describe blocks
- `.gsd/milestones/M009/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M009/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section
