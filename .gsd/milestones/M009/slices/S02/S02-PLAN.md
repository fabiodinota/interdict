# S02: Security Hardening — Proxy, Helm, Secrets

**Goal:** BFF proxy rejects unknown paths with 403 and oversized bodies with 413. Helm chart fails on empty passwords without existingSecret. Dev DB fallback requires explicit opt-in. Docker Compose and Helm volumes/images are hardened.
**Demo:** `npx vitest run` passes with proxy allowlist + body cap tests. `helm template` with empty password fails. `bun test` passes with config dev-fallback tests. `docker compose config` validates volume/port changes.

## Must-Haves

- BFF proxy path allowlist matching control-plane API module prefixes — rejects disallowed paths with 403
- BFF proxy body size cap at 2MB — rejects oversized requests with 413
- Helm `interdict.validateRequired` helper that fails `helm template` when `postgresql.auth.password` or `minio.auth.rootPassword` is empty and no `existingSecret` is set
- `DATABASE_URL` removed from control-plane ConfigMap (Deployment env already constructs it)
- `signing_keys` volume mount `readOnly: true` in Helm evidence-collector deployment
- `busybox:1.36` init container images pinned by manifest-list digest in all four Helm deployments
- Dev DB fallback in `control-plane/src/config.ts` gated behind `ALLOW_DEV_DEFAULTS=true` env var
- `signing_keys:/data/keys:ro` in Docker Compose
- Test compose ports bound to `127.0.0.1:`

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all dashboard tests pass including new proxy allowlist (403) and body cap (413) tests
- `bun test` — all control-plane tests pass including new `ALLOW_DEV_DEFAULTS` gating tests
- `helm lint helm/interdict` — chart lints clean
- `helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders successfully
- `helm template interdict helm/interdict --set postgresql.auth.password=""` — fails with clear error mentioning `postgresql.auth.password`
- `docker compose config` — validates compose file with `:ro` volume
- `docker compose -f docker-compose.yml -f docker-compose.test.yml config` — validates test overlay with `127.0.0.1:` ports
- `rg "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml` — matches signing-keys mount
- `rg "127\.0\.0\.1:" docker-compose.test.yml` — matches all port mappings

## Integration Closure

- Upstream surfaces consumed: control-plane API route prefixes (auth, policies, vendors, regulatory, audit, reports, admin/signing-keys, evidence, reviews, department-overrides, anomalies)
- New wiring introduced in this slice: proxy path allowlist array in route handler, Helm validateRequired helper called from deployment templates
- What remains before the milestone is truly usable end-to-end: S03 adds rate limiting to write endpoints, S05 adds Docker Compose cert-init non-root + CI checksum verification, S06 adds proto deprecated field enforcement

## Tasks

- [x] **T01: Add BFF proxy path allowlist and body size cap** `est:45m`
  - Why: Assessment finding H-03 — the proxy forwards any path to the control plane with zero validation. This is the highest-risk finding in the slice.
  - Files: `dashboard/src/app/api/proxy/[...path]/route.ts`, `dashboard/src/__tests__/api/proxy.test.ts`
  - Do: Add `ALLOWED_PREFIXES` array matching control-plane module prefixes. Validate first path segment against allowlist before URL construction — return 403 for disallowed paths. Add `Content-Length` check before forwarding — return 413 for bodies over 2MB. Add tests for: disallowed path returns 403, each allowed prefix succeeds, body over 2MB returns 413, body at 2MB succeeds, missing Content-Length on POST is allowed (for streaming).
  - Verify: `npx vitest run` — all proxy tests pass including new allowlist and body cap tests
  - Done when: proxy rejects `/api/proxy/evil/path` with 403 and oversized POST with 413, all existing 18 tests still pass, new tests prove both boundaries
- [x] **T02: Add Helm credential validation, ConfigMap cleanup, and image hardening** `est:45m`
  - Why: Assessment findings H-04 (empty passwords), M-06 (ConfigMap DATABASE_URL duplication), M-09 (signing-keys read-write), L-18 (unpinned busybox).
  - Files: `helm/interdict/templates/_helpers.tpl`, `helm/interdict/templates/control-plane/configmap.yaml`, `helm/interdict/templates/control-plane/deployment.yaml`, `helm/interdict/templates/evidence-collector/deployment.yaml`, `helm/interdict/templates/kernel/deployment.yaml`, `helm/interdict/templates/dashboard/deployment.yaml`, `helm/interdict/values.yaml`
  - Do: (1) Add `interdict.validateRequired` named template in `_helpers.tpl` that uses `fail` when a value is empty and no existingSecret is set — check both `postgresql.auth.password`/`existingSecret` and `minio.auth.rootPassword`/`existingSecret`. Call the helper from `control-plane/deployment.yaml` (or a central template). (2) Remove `DATABASE_URL` line from `control-plane/configmap.yaml`. (3) Add `readOnly: true` to `signing-keys` volumeMount in `evidence-collector/deployment.yaml`. (4) Pin `busybox:1.36` to manifest-list digest in all four deployment init containers — use `docker buildx imagetools inspect busybox:1.36` or `crane digest busybox:1.36` to resolve the digest, keeping tag as comment for readability.
  - Verify: `helm lint helm/interdict` clean. `helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=test` renders. `helm template interdict helm/interdict --set postgresql.auth.password=""` fails with error.
  - Done when: `helm template` fails on empty password, ConfigMap has no DATABASE_URL, signing-keys has readOnly, all four busybox refs use digest
- [x] **T03: Gate dev DB fallback behind ALLOW_DEV_DEFAULTS and harden Docker Compose** `est:30m`
  - Why: Assessment finding M-10 (silent dev fallback) and M-09/L-25 (compose volume and port binding hardening).
  - Files: `control-plane/src/config.ts`, `control-plane/src/config.test.ts`, `docker-compose.yml`, `docker-compose.test.yml`
  - Do: (1) In `config.ts` `loadConfig()`, change the DATABASE_URL dev fallback: only apply the `"postgres://interdict:interdict@localhost:5432/interdict"` fallback when `!isProduction && process.env.ALLOW_DEV_DEFAULTS === "true"`. Apply same pattern to other dev fallbacks (clickhouseUrl, etc.) — they all should require `ALLOW_DEV_DEFAULTS=true`. (2) Update `config.test.ts` with tests: without `ALLOW_DEV_DEFAULTS`, missing `DATABASE_URL` throws; with `ALLOW_DEV_DEFAULTS=true`, fallback works; production mode ignores `ALLOW_DEV_DEFAULTS`. (3) In `docker-compose.yml`, change `signing_keys:/data/keys` to `signing_keys:/data/keys:ro` for evidence-collector. (4) In `docker-compose.test.yml`, prefix all port mappings with `127.0.0.1:` (e.g., `"127.0.0.1:15432:5432"`).
  - Verify: `bun test` passes. `docker compose config` validates. `docker compose -f docker-compose.yml -f docker-compose.test.yml config` validates.
  - Done when: missing DATABASE_URL without ALLOW_DEV_DEFAULTS throws in dev mode, signing_keys volume is :ro, all test ports bind to 127.0.0.1

## Observability / Diagnostics

- **Proxy 403/413 responses:** Rejected requests return structured JSON `{ success: false, error: { message } }` with appropriate HTTP status codes. No server-side logging added — the response itself is the signal. A future agent can verify enforcement by sending disallowed paths or oversized bodies and checking response codes.
- **Helm validation failures:** `helm template` emits `fail` messages with the specific missing credential name. These are visible in CI output and local `helm template` runs.
- **Config dev-fallback gating:** Missing `DATABASE_URL` without `ALLOW_DEV_DEFAULTS=true` throws a descriptive error including the env var name. This surfaces in process stderr at startup.
- **Redaction constraints:** No secrets flow through the new code paths. The proxy allowlist and body cap operate on path segments and Content-Length headers only.

## Files Likely Touched

- `dashboard/src/app/api/proxy/[...path]/route.ts`
- `dashboard/src/__tests__/api/proxy.test.ts`
- `helm/interdict/templates/_helpers.tpl`
- `helm/interdict/templates/control-plane/configmap.yaml`
- `helm/interdict/templates/control-plane/deployment.yaml`
- `helm/interdict/templates/evidence-collector/deployment.yaml`
- `helm/interdict/templates/kernel/deployment.yaml`
- `helm/interdict/templates/dashboard/deployment.yaml`
- `helm/interdict/values.yaml`
- `control-plane/src/config.ts`
- `control-plane/src/config.test.ts`
- `docker-compose.yml`
- `docker-compose.test.yml`
