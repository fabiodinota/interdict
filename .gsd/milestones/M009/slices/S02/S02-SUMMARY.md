---
id: S02
parent: M009
milestone: M009
provides:
  - BFF proxy path allowlist (11 control-plane module prefixes) with 403 rejection
  - BFF proxy 2MB body size cap with 413 rejection
  - Helm interdict.validateRequired helper that fail-closes on empty credentials without existingSecret
  - DATABASE_URL removed from control-plane ConfigMap (single source in Deployment env)
  - signing-keys volume mount readOnly in evidence-collector (Helm and Docker Compose)
  - busybox:1.36 pinned to manifest-list digest in all 4 Helm init containers
  - ALLOW_DEV_DEFAULTS env var gating for all control-plane dev fallbacks
  - Docker Compose signing_keys volumes read-only for both control-plane and evidence-collector
  - Test compose ports bound to 127.0.0.1
requires:
  - slice: none
    provides: independent slice
affects:
  - S03 (rate limiting builds on proxy pattern)
  - S05 (infrastructure hardening extends Docker Compose and Helm changes)
key_files:
  - dashboard/src/app/api/proxy/[...path]/route.ts
  - dashboard/src/__tests__/api/proxy.test.ts
  - helm/interdict/templates/_helpers.tpl
  - helm/interdict/templates/control-plane/deployment.yaml
  - helm/interdict/templates/control-plane/configmap.yaml
  - helm/interdict/templates/evidence-collector/deployment.yaml
  - helm/interdict/templates/kernel/deployment.yaml
  - helm/interdict/templates/dashboard/deployment.yaml
  - control-plane/src/config.ts
  - control-plane/src/config.test.ts
  - docker-compose.yml
  - docker-compose.test.yml
key_decisions:
  - D066: isProduction moved inside loadConfig() for testability — module-scope const was frozen at import time
  - D067: devFallback() closure pattern gates dev defaults behind ALLOW_DEV_DEFAULTS=true
  - D044: Manifest-list digest pinning for busybox — Docker selects correct platform at pull time
  - Body size check uses Content-Length header only — missing header allowed for streaming/chunked
  - Path check matches first segment only so "admin" covers "admin/signing-keys"
  - Validation calls placed at top of control-plane/deployment.yaml — simplest approach
patterns_established:
  - Early-return guard pattern in proxy: validate path → validate body size → construct URL → forward
  - interdict.validateRequired Helm helper reusable for any future required-credential checks
  - devFallback() closure for gating dev-only defaults behind explicit opt-in env var
observability_surfaces:
  - HTTP 403 with structured JSON for disallowed proxy paths
  - HTTP 413 with structured JSON including maxBytes for oversized bodies
  - helm template emits fail message naming the missing credential
  - Missing env vars without ALLOW_DEV_DEFAULTS produce descriptive error on stderr at startup
  - Read-only volume violations surface as EROFS in container logs
  - Digest pin mismatch surfaces as ErrImagePull in pod events
drill_down_paths:
  - .gsd/milestones/M009/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S02/tasks/T03-SUMMARY.md
duration: 60m
verification_result: passed
completed_at: 2026-03-16
---

# S02: Security Hardening — Proxy, Helm, Secrets

**BFF proxy rejects disallowed paths (403) and oversized bodies (413), Helm chart fail-closes on empty credentials, dev DB fallbacks require explicit opt-in, and Docker Compose/Helm volumes and images are hardened.**

## What Happened

Three tasks delivered nine hardening items from the v1.6 foundation assessment:

**T01 — Proxy path allowlist and body size cap.** Added `ALLOWED_PATH_PREFIXES` constant with all 11 control-plane module prefixes (auth, policies, vendors, regulatory, audit, reports, admin, evidence, reviews, department-overrides, anomalies). Path validation extracts the first segment and returns 403 before URL construction for disallowed paths. Body size cap at 2MB inspects `Content-Length` on non-GET/HEAD methods and returns 413 with structured error. Missing `Content-Length` is allowed for streaming. Both guards execute after auth but before upstream forwarding. 13 new tests added (31 total proxy tests).

**T02 — Helm credential validation, ConfigMap cleanup, and image hardening.** Added `interdict.validateRequired` named template to `_helpers.tpl` — uses Helm `fail` when a credential is empty and no `existingSecret` is set. Checks both `postgresql.auth.password` and `minio.auth.rootPassword`. Removed duplicate `DATABASE_URL` from control-plane ConfigMap. Added `readOnly: true` to signing-keys volumeMount in evidence-collector. Pinned all four busybox:1.36 init container images by manifest-list digest (`sha256:b9598f8c98e2...`).

**T03 — Dev fallback gating and Docker Compose hardening.** Gated all five dev fallback values (DATABASE_URL, CLICKHOUSE_URL, CLICKHOUSE_DATABASE, WASM_STORAGE_DIR, OPA_BINARY_PATH) behind `ALLOW_DEV_DEFAULTS=true`. Moved `isProduction` inside `loadConfig()` for testability. Added `devFallback()` closure that returns fallback only when `!isProduction && ALLOW_DEV_DEFAULTS === "true"`. Made `signing_keys:/data/keys:ro` in both control-plane and evidence-collector volumes. Prefixed all 6 test compose port mappings with `127.0.0.1:`. 5 new config tests added (16 total config tests).

## Verification

All slice-level verification checks passed:

- ✅ `npx vitest run` (dashboard) — 400/400 tests pass across 53 files, including 13 new proxy allowlist/body cap tests
- ✅ `bun test src/config.test.ts` — 16/16 pass, including 5 new ALLOW_DEV_DEFAULTS gating tests
- ✅ `helm lint helm/interdict` — 0 charts failed
- ✅ `helm template ... --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders successfully
- ✅ `helm template ... --set postgresql.auth.password=""` — fails with `postgresql.auth.password is required — set it via --set or provide existingSecret`
- ✅ `helm template ... --set minio.auth.rootPassword=""` — fails with `minio.auth.rootPassword is required`
- ✅ `helm template ... --set postgresql.auth.existingSecret=x --set minio.auth.existingSecret=x` — renders (existingSecret bypass works)
- ✅ `docker compose config` (with populated env) — validates
- ✅ `docker compose -f docker-compose.yml -f docker-compose.test.yml config` — validates
- ✅ `grep "readOnly: true" evidence-collector/deployment.yaml` — matches both certs and signing-keys mounts
- ✅ `grep "signing_keys:/data/keys:ro" docker-compose.yml` — matches lines 194 and 260
- ✅ `grep "127.0.0.1:" docker-compose.test.yml` — matches all 6 port mappings

## Requirements Advanced

- FH-SECURITY-01 — All five items addressed: proxy path allowlist with 403, Helm credential validation, ConfigMap cleanup, dev fallback gating behind ALLOW_DEV_DEFAULTS, signing-keys read-only mount

## Requirements Validated

- none — FH-SECURITY-01 also covers rate limiting (S03) and busybox digest pinning verification at runtime; full validation deferred to milestone completion

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `isProduction` moved from module scope to inside `loadConfig()` — plan implied keeping it at module scope but that froze the value at import time, making production mode untestable. Moving it inside the function preserves the same security property while enabling full test coverage.
- `helm template` verification required `--dependency-update` flag — Helm v4.1.1 dependency resolver needs this even when charts/ directory has tgz files. `helm lint` validates syntax without it.
- `docker compose config` requires a populated `.env` file — fail-closed credential enforcement is working as designed; verification used env.example with test values.

## Known Limitations

- `helm template` cannot be fully verified locally without subchart dependencies (postgresql, clickhouse, minio) pre-downloaded. `helm lint` passes which validates template syntax. CI runs `helm dependency build` in a separate step.
- 28 pre-existing `bun test` failures from missing npm packages (drizzle-orm, elysia, @grpc/grpc-js, samlify) — unrelated to this slice's changes. Config tests pass cleanly.
- OpenAI test key placeholder replacement was listed in the roadmap slice description but was not included in the S02 plan tasks — likely deferred or addressed elsewhere.

## Follow-ups

- none

## Files Created/Modified

- `dashboard/src/app/api/proxy/[...path]/route.ts` — Added ALLOWED_PATH_PREFIXES, MAX_BODY_SIZE, path validation guard, body size guard
- `dashboard/src/__tests__/api/proxy.test.ts` — Added 13 tests in Path allowlist and Body size limit describe blocks
- `helm/interdict/templates/_helpers.tpl` — Added interdict.validateRequired named template
- `helm/interdict/templates/control-plane/deployment.yaml` — Added validation calls, pinned busybox digest
- `helm/interdict/templates/control-plane/configmap.yaml` — Removed duplicate DATABASE_URL
- `helm/interdict/templates/evidence-collector/deployment.yaml` — Added readOnly to signing-keys mount, pinned busybox digest
- `helm/interdict/templates/kernel/deployment.yaml` — Pinned busybox digest
- `helm/interdict/templates/dashboard/deployment.yaml` — Pinned busybox digest
- `control-plane/src/config.ts` — Gated dev fallbacks behind ALLOW_DEV_DEFAULTS with devFallback() closure
- `control-plane/src/config.test.ts` — Added 5 ALLOW_DEV_DEFAULTS gating tests, updated existing tests
- `docker-compose.yml` — Added :ro to both signing_keys volume mounts
- `docker-compose.test.yml` — Prefixed all 6 port mappings with 127.0.0.1

## Forward Intelligence

### What the next slice should know
- The proxy path allowlist in `route.ts` matches first path segment only — adding new control-plane modules requires adding the prefix to `ALLOWED_PATH_PREFIXES`
- `ALLOW_DEV_DEFAULTS=true` must be set in any test or dev environment that previously relied on implicit fallbacks — docker-compose.yml may need this in the environment section for the control-plane service
- Helm `interdict.validateRequired` helper is generic — reuse it for any future required credentials rather than inline checks

### What's fragile
- `helm template` verification depends on `--dependency-update` flag or pre-built charts/ directory — CI and local dev may diverge if subchart versions change
- The `devFallback()` closure is inside `loadConfig()` so it's re-evaluated per call — if someone caches config at module scope the gating still works, but moving the closure out would break it

### Authoritative diagnostics
- Proxy rejection: send GET to `/api/proxy/evil/path` → 403 JSON response confirms allowlist enforcement
- Helm validation: `helm template` with empty credentials shows the specific missing field name in the error
- Config gating: run control-plane without DATABASE_URL or ALLOW_DEV_DEFAULTS → stderr shows exact missing env var name

### What assumptions changed
- Helm v4 dependency resolution behavior differs from v3 — `--dependency-update` flag needed for `helm template` even with tgz files in charts/
- `docker compose config` requires populated .env — this is the correct fail-closed behavior from credential parameterization in M008/S04
