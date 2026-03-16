# S02: Security Hardening — Proxy, Helm, Secrets — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are verifiable via CLI commands (vitest, bun test, helm lint/template, docker compose config, grep). No runtime services or browser UI needed.

## Preconditions

- Node.js and npm available (for `npx vitest`)
- Bun available (for `bun test`)
- Helm v4+ available
- Docker Compose available
- A populated `.env` file (copy from `env.example` with test credentials) for Docker Compose validation

## Smoke Test

Run `npx vitest run` from the `dashboard/` directory — all 400 tests pass including the new proxy allowlist and body size tests.

## Test Cases

### 1. Proxy rejects disallowed path with 403

1. Inspect `dashboard/src/__tests__/api/proxy.test.ts` — locate the "Path allowlist" describe block
2. Run `cd dashboard && npx vitest run src/__tests__/api/proxy.test.ts`
3. **Expected:** Test "returns 403 for disallowed path prefix" passes — a request to `/api/proxy/evil/path` returns HTTP 403 with `{ success: false, error: { message: "Forbidden" } }`

### 2. Proxy rejects oversized body with 413

1. Run `cd dashboard && npx vitest run src/__tests__/api/proxy.test.ts`
2. **Expected:** Test "returns 413 for body exceeding 2MB" passes — a POST with `Content-Length: 3000000` returns HTTP 413 with `{ success: false, error: { message: "Request body too large", maxBytes: 2097152 } }`

### 3. Proxy allows known prefixes

1. Run `cd dashboard && npx vitest run src/__tests__/api/proxy.test.ts`
2. **Expected:** Tests for "policies", "vendors", "evidence", "admin" prefixes all pass — requests forwarded to upstream

### 4. Proxy allows missing Content-Length

1. Run `cd dashboard && npx vitest run src/__tests__/api/proxy.test.ts`
2. **Expected:** Test "allows POST without Content-Length header" passes — streaming/chunked requests are not blocked

### 5. Helm fails on empty postgresql password

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password="" --set minio.auth.rootPassword=test`
2. **Expected:** Exit code 1, error message contains `postgresql.auth.password is required — set it via --set or provide existingSecret`

### 6. Helm fails on empty minio password

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=""`
2. **Expected:** Exit code 1, error message contains `minio.auth.rootPassword is required`

### 7. Helm renders with valid credentials

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test`
2. **Expected:** Exit code 0, YAML output rendered successfully

### 8. Helm existingSecret bypass works

1. Run `helm template interdict helm/interdict --dependency-update --set postgresql.auth.existingSecret=my-pg-secret --set minio.auth.existingSecret=my-minio-secret`
2. **Expected:** Exit code 0 — empty password with existingSecret does not trigger validation failure

### 9. Helm lint passes

1. Run `helm lint helm/interdict`
2. **Expected:** `1 chart(s) linted, 0 chart(s) failed`

### 10. Config throws without ALLOW_DEV_DEFAULTS

1. Run `cd control-plane && bun test src/config.test.ts`
2. **Expected:** Test "throws for missing DATABASE_URL in dev mode without ALLOW_DEV_DEFAULTS" passes — `loadConfig()` throws `Required environment variable DATABASE_URL is not set`

### 11. Config fallback works with ALLOW_DEV_DEFAULTS=true

1. Run `cd control-plane && bun test src/config.test.ts`
2. **Expected:** Test "returns fallback for missing DATABASE_URL in dev mode with ALLOW_DEV_DEFAULTS=true" passes — `loadConfig()` returns `postgres://interdict:interdict@localhost:5432/interdict`

### 12. Config ignores ALLOW_DEV_DEFAULTS in production

1. Run `cd control-plane && bun test src/config.test.ts`
2. **Expected:** Test "ignores ALLOW_DEV_DEFAULTS in production mode" passes — `loadConfig()` throws even with `ALLOW_DEV_DEFAULTS=true` when `NODE_ENV=production`

### 13. Docker Compose signing_keys is read-only

1. Run `grep "signing_keys:/data/keys:ro" docker-compose.yml`
2. **Expected:** Two matches — control-plane and evidence-collector volumes both have `:ro` suffix

### 14. Test compose ports bound to localhost

1. Run `grep "127.0.0.1:" docker-compose.test.yml`
2. **Expected:** Six matches — all port mappings prefixed with `127.0.0.1:` (15432, 18123, 19000, 19001, 13001, 18443)

### 15. Docker Compose validates

1. Copy `env.example` to `.env` and populate credential placeholders with test values
2. Run `docker compose config > /dev/null`
3. Run `docker compose -f docker-compose.yml -f docker-compose.test.yml config > /dev/null`
4. **Expected:** Both exit code 0

## Edge Cases

### Empty path segment in proxy

1. Send request to `/api/proxy/` (no path after proxy)
2. **Expected:** Returns 403 — empty first segment does not match any allowed prefix

### Path traversal attempt

1. Send request to `/api/proxy/../etc/passwd`
2. **Expected:** Returns 403 — path traversal segments don't match allowed prefixes

### Exactly 2MB body

1. Send POST to `/api/proxy/policies` with `Content-Length: 2097152`
2. **Expected:** Request proceeds — boundary value is allowed (strictly greater than 2MB triggers 413)

### GET with large Content-Length

1. Send GET to `/api/proxy/policies` with `Content-Length: 10000000`
2. **Expected:** Request proceeds — body size check only applies to non-GET/HEAD methods

### Helm signing-keys readOnly

1. Run `grep "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml`
2. **Expected:** Two matches — both certs and signing-keys volumeMounts have readOnly

### Busybox digest pinning

1. Run `grep "busybox:1.36@sha256:" helm/interdict/templates/control-plane/deployment.yaml helm/interdict/templates/evidence-collector/deployment.yaml helm/interdict/templates/kernel/deployment.yaml helm/interdict/templates/dashboard/deployment.yaml`
2. **Expected:** Four matches — all init containers use `busybox:1.36@sha256:b9598f8c98e2...`

### ConfigMap DATABASE_URL removed

1. Run `grep "DATABASE_URL" helm/interdict/templates/control-plane/configmap.yaml`
2. **Expected:** No matches — DATABASE_URL removed from ConfigMap

## Failure Signals

- `npx vitest run` shows any failures in proxy.test.ts → proxy allowlist or body cap broken
- `bun test src/config.test.ts` shows failures in ALLOW_DEV_DEFAULTS block → dev fallback gating broken
- `helm template` with empty password exits 0 → credential validation not wired up
- `helm template` with valid passwords exits non-zero → validation helper too aggressive
- `grep "signing_keys:/data/keys:ro"` returns fewer than 2 matches → volume hardening incomplete
- `grep "127.0.0.1:"` returns fewer than 6 matches → test port binding incomplete
- `docker compose config` fails with credential error → expected if .env not populated (not a bug)

## Requirements Proved By This UAT

- FH-SECURITY-01 — BFF proxy path allowlist (test cases 1-4), Helm credential validation (test cases 5-9), ConfigMap cleanup (edge case: ConfigMap DATABASE_URL removed), dev fallback gating (test cases 10-12), signing-keys read-only (test case 13, edge case: Helm readOnly)

## Not Proven By This UAT

- Runtime proxy behavior under actual HTTP traffic (tested via unit tests only, not live requests)
- Busybox digest correctness at pull time (verified structurally via grep, not via container pull)
- EROFS errors from read-only volume violations (requires running container writes)
- S03 rate limiting on write endpoints (separate slice)
- S05 Docker Compose cert-init non-root and CI checksum verification (separate slice)

## Notes for Tester

- `helm template` requires `--dependency-update` flag on Helm v4+ when subchart tgz files aren't pre-built. If you see dependency errors, add the flag or run `helm dependency build helm/interdict` first.
- `docker compose config` intentionally fails without a populated `.env` — this is the fail-closed credential design from M008/S04. Copy `env.example` and replace `CHANGE_ME` placeholders.
- The 28 pre-existing `bun test` failures from missing npm packages (drizzle-orm, elysia, etc.) are unrelated to S02. Only `src/config.test.ts` is relevant to this slice.
