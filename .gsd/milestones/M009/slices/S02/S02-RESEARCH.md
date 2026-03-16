# S02: Security Hardening — Proxy, Helm, Secrets — Research

**Date:** 2026-03-16

## Summary

S02 addresses requirement **FH-SECURITY-01** (BFF proxy path validation, Helm credential enforcement, dev fallback gating) plus several related hardening items from the v1.6 assessment. The work spans three codebases — Next.js dashboard (proxy route), Helm chart templates/helpers, and control-plane config — plus minor Docker Compose and test fixture fixes.

The current BFF proxy (`dashboard/src/app/api/proxy/[...path]/route.ts`) forwards any `targetPath` to the control plane at `/api/v1/${targetPath}` with zero validation. The Helm chart's `values.yaml` has `postgresql.auth.password: ""` with no template-level guard, so `helm template` silently produces a deployment with an empty password. The control-plane `config.ts` silently falls back to `postgres://interdict:interdict@localhost:5432/interdict` in non-production mode with no opt-in flag. Evidence-collector's `signing_keys` volume is mounted read-write in Docker Compose despite being read-only by the collector. All four Helm deployments use `busybox:1.36` by tag rather than digest.

All items are well-understood patterns with no novel technology. This is **light-to-targeted** research.

## Recommendation

Implement as six discrete units grouped by codebase: (1) proxy allowlist + body cap in dashboard, (2) Helm `validateRequired` helper + ConfigMap cleanup, (3) config.ts dev fallback gating, (4) Docker Compose volume/port fixes, (5) busybox digest pinning in Helm, (6) test fixture cleanup. Each is independently testable. Start with the proxy allowlist — it's the highest-risk finding (H-03) and has the most complex test surface.

## Implementation Landscape

### Key Files

- `dashboard/src/app/api/proxy/[...path]/route.ts` — BFF proxy; currently forwards any path to control-plane `/api/v1/<path>`. Needs path allowlist check before forwarding and body size cap (2MB via `Content-Length` header check).
- `dashboard/src/__tests__/api/proxy.test.ts` — Comprehensive proxy tests (18 cases). Add tests for 403 on disallowed paths and 413 on oversized body.
- `dashboard/next.config.ts` — Next.js config. Body size limit may also need `api.bodyParser.sizeLimit` if Next.js route handlers have one, but the proxy uses `request.text()` not automatic parsing — the `Content-Length` check in the route handler is sufficient.
- `helm/interdict/templates/_helpers.tpl` — Helm template helpers. Add `interdict.validateRequired` helper that calls `required` or `fail` on empty values.
- `helm/interdict/values.yaml` — Default values; `postgresql.auth.password: ""` and `minio.auth.rootPassword: ""` are the targets.
- `helm/interdict/templates/control-plane/deployment.yaml` — Already constructs `DATABASE_URL` in env spec (line 60-61). The ConfigMap at `helm/interdict/templates/control-plane/configmap.yaml` still has a duplicate `DATABASE_URL` entry that should be removed.
- `helm/interdict/templates/control-plane/configmap.yaml` — Contains `DATABASE_URL` with `$(POSTGRES_PASSWORD)` interpolation that's redundant with the Deployment env construction. Remove it.
- `helm/interdict/templates/evidence-collector/deployment.yaml` — `signing-keys` volume mounted at `/data/keys` without `readOnly: true`. Add it.
- `helm/interdict/templates/kernel/deployment.yaml`, `dashboard/deployment.yaml`, `control-plane/deployment.yaml`, `evidence-collector/deployment.yaml` — All four use `busybox:1.36` init containers by tag. Pin to digest.
- `control-plane/src/config.ts` — `loadConfig()` uses `requireEnv("DATABASE_URL", isProduction ? undefined : "postgres://interdict:interdict@localhost:5432/interdict")`. Gate the dev fallback behind `ALLOW_DEV_DEFAULTS=true`.
- `control-plane/src/config.test.ts` — Tests for config loading. Add tests for `ALLOW_DEV_DEFAULTS` gating.
- `docker-compose.yml` — evidence-collector has `signing_keys:/data/keys` (read-write). Change to `signing_keys:/data/keys:ro`.
- `docker-compose.test.yml` — Ports already use `!override` with remapped ports (`15432`, `18123`, etc.) but bind to `0.0.0.0` implicitly. Prefix with `127.0.0.1:` for all port mappings.

### Control Plane API Routes (proxy allowlist reference)

The control-plane registers these module prefixes:
- `/api/v1/auth` — auth (login, logout, SAML, me)
- `/api/v1/policies` — policy CRUD + compiler
- `/api/v1/vendors` — vendor registry
- `/api/v1/regulatory` — regulatory frameworks
- `/api/v1/audit` — audit log + SSE stream
- `/api/v1/reports` — report generation
- `/api/v1/admin/signing-keys` — key rotation
- `/api/v1/evidence` — evidence queries
- `/api/v1/reviews` — review queue
- `/api/v1/department-overrides` — department policy overrides
- `/api/v1/anomalies` — anomaly detection

The proxy allowlist should permit exactly these path prefixes (first segment after `/api/v1/`).

### Build Order

1. **Proxy allowlist + body cap** (H-03 — highest risk) — Define allowed path prefixes array, add check before URL construction, return 403 for disallowed paths. Add 2MB body size check returning 413. Update proxy tests. Run `npx vitest run`.
2. **Helm validateRequired + ConfigMap cleanup** (H-04) — Add `interdict.validateRequired` helper in `_helpers.tpl`. Use it in deployments for `postgresql.auth.password` (when no `existingSecret`) and `minio.auth.rootPassword` (when no `existingSecret`). Remove `DATABASE_URL` from ConfigMap. Run `helm lint helm/interdict` and `helm template --set postgresql.auth.password="" interdict helm/interdict` (should fail).
3. **Config dev fallback gating** — Modify `requireEnv` in `config.ts` to check `ALLOW_DEV_DEFAULTS` before applying dev fallbacks. Update tests. Run `bun test`.
4. **Docker Compose fixes** — `signing_keys` volume → `:ro`, test compose ports → `127.0.0.1:` prefix. Run `docker compose config` and `docker compose -f docker-compose.yml -f docker-compose.test.yml config`.
5. **Busybox digest pinning** — Look up `busybox:1.36` manifest-list digest, replace all four Helm deployment init container images. Run `helm lint`.
6. **OpenAI test key replacement** — The `scripts/test/.env.test.example` has placeholder values (`n...`, `nant-...`) that already look like placeholders. Verify no real keys exist.

### Verification Approach

- `npx vitest run` — dashboard tests pass (proxy allowlist + body cap tests)
- `bun test` — control-plane tests pass (config dev fallback tests)
- `helm lint helm/interdict` — chart lints clean
- `helm dependency build helm/interdict && helm template interdict helm/interdict --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — renders successfully
- `helm template interdict helm/interdict --set postgresql.auth.password=""` — fails with clear error
- `docker compose config` — validates compose file
- `docker compose -f docker-compose.yml -f docker-compose.test.yml config` — validates test overlay
- Structural grep: `rg "readOnly: true" helm/interdict/templates/evidence-collector/deployment.yaml` confirms signing-keys is read-only
- Structural grep: `rg "127\.0\.0\.1:" docker-compose.test.yml` confirms localhost binding

## Constraints

- Next.js App Router route handlers don't have built-in body size limits like Pages API routes — the check must be explicit in the handler via `Content-Length` header inspection (same pattern already used in control-plane's `onRequest` handler).
- Helm `required` function causes `helm template` to fail but `helm lint` may still pass with empty values — tests should use `helm template` specifically.
- `busybox` digest must be a manifest-list digest (not per-architecture) per D044 — this allows multi-platform pulls.
- The control-plane `isProduction` is evaluated at module load time (`const isProduction = process.env.NODE_ENV === "production"`) — `ALLOW_DEV_DEFAULTS` check must also be at load time, not runtime-togglable.

## Common Pitfalls

- **Proxy allowlist too strict** — The allowlist must match path *prefixes*, not exact paths. Routes like `/api/v1/policies/123/compile` must match the `policies` prefix. Use the first path segment only.
- **Helm required vs fail** — Helm's `required` function produces clear error messages but only works on values that evaluate to empty. For checking `postgresql.auth.password` when `existingSecret` is also empty, use a conditional `fail` in a named template helper.
- **ConfigMap DATABASE_URL removal** — The Deployment already constructs `DATABASE_URL` in its env spec (lines 60-61). But it uses `envFrom: configMapRef` — after removing `DATABASE_URL` from ConfigMap, the inline `env` entry in the Deployment still provides it. Verify no other templates reference the ConfigMap's `DATABASE_URL`.

## Sources

- D044: Docker base images pinned by manifest-list digest
- D050: Dual-layer body size limit pattern (used in control-plane, adapt for dashboard proxy)
- D011: BFF proxy pattern for dashboard
