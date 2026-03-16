---
estimated_steps: 5
estimated_files: 4
---

# T03: Gate dev DB fallback behind ALLOW_DEV_DEFAULTS and harden Docker Compose

**Slice:** S02 — Security Hardening — Proxy, Helm, Secrets
**Milestone:** M009

## Description

The control-plane `config.ts` silently falls back to `postgres://interdict:interdict@localhost:5432/interdict` in non-production mode with no opt-in flag (assessment finding M-10). Gate all dev fallbacks behind `ALLOW_DEV_DEFAULTS=true`. Additionally, harden Docker Compose: signing_keys volume should be read-only, and test compose ports should bind to localhost only.

## Steps

1. **Gate dev fallbacks in `config.ts`.** The current pattern is:
   ```typescript
   databaseUrl: requireEnv("DATABASE_URL", isProduction ? undefined : "postgres://..."),
   ```
   Change the `requireEnv` function or the call sites so dev fallbacks only apply when `process.env.ALLOW_DEV_DEFAULTS === "true"`. Recommended approach — introduce a helper:
   ```typescript
   const allowDevDefaults = !isProduction && process.env.ALLOW_DEV_DEFAULTS === "true";

   function devFallback(value: string): string | undefined {
     return allowDevDefaults ? value : undefined;
   }
   ```
   Then replace all `isProduction ? undefined : "fallback"` with `devFallback("fallback")`:
   ```typescript
   databaseUrl: requireEnv("DATABASE_URL", devFallback("postgres://interdict:interdict@localhost:5432/interdict")),
   clickhouseUrl: requireEnv("CLICKHOUSE_URL", devFallback("http://localhost:8123")),
   clickhouseDatabase: requireEnv("CLICKHOUSE_DATABASE", devFallback("interdict")),
   wasmStorageDir: requireEnv("WASM_STORAGE_DIR", devFallback("./data/wasm")),
   opaBinaryPath: requireEnv("OPA_BINARY_PATH", devFallback("opa")),
   ```
   The `allowDevDefaults` const must be evaluated at module load time (not runtime-togglable), matching `isProduction`.

2. **Update `config.test.ts`.** Add tests in a new `describe("ALLOW_DEV_DEFAULTS gating")` block:
   - Test: without `ALLOW_DEV_DEFAULTS`, missing `DATABASE_URL` in dev mode throws
   - Test: with `ALLOW_DEV_DEFAULTS=true`, missing `DATABASE_URL` in dev mode returns fallback
   - Test: in production mode (`NODE_ENV=production`), `ALLOW_DEV_DEFAULTS=true` is ignored — missing `DATABASE_URL` still throws
   - Test: with `ALLOW_DEV_DEFAULTS=true`, all fallback values are applied (spot-check clickhouseUrl and wasmStorageDir)

   Note: `loadConfig()` reads `process.env` at call time. Tests will need to set/clear env vars. Check the existing test patterns in the file — they likely use `process.env` manipulation with `beforeEach`/`afterEach` cleanup.

3. **Docker Compose signing_keys volume.** In `docker-compose.yml`, the evidence-collector service has two volume entries with `signing_keys:/data/keys`. Change to `signing_keys:/data/keys:ro`. There are two occurrences (evidence-collector uses the volume in two services — check both). The evidence-collector container only reads keys, so `:ro` is correct.

4. **Docker Compose test ports.** In `docker-compose.test.yml`, prefix all port mappings with `127.0.0.1:`. Current format:
   ```yaml
   - "15432:5432"
   ```
   Change to:
   ```yaml
   - "127.0.0.1:15432:5432"
   ```
   Apply to ALL port mappings in the file (15432, 18123, 19000, 19001, 13001, 18443, and any others).

5. **Verify all changes:**
   ```bash
   bun test
   docker compose config > /dev/null
   docker compose -f docker-compose.yml -f docker-compose.test.yml config > /dev/null
   rg "signing_keys:/data/keys:ro" docker-compose.yml
   rg "127\.0\.0\.1:" docker-compose.test.yml
   ```

## Must-Haves

- [ ] `ALLOW_DEV_DEFAULTS` check is at module load time (const, not function call)
- [ ] Missing `DATABASE_URL` without `ALLOW_DEV_DEFAULTS` throws in dev mode
- [ ] Production mode ignores `ALLOW_DEV_DEFAULTS`
- [ ] Dev fallback works when `ALLOW_DEV_DEFAULTS=true`
- [ ] `signing_keys:/data/keys:ro` in Docker Compose (both occurrences if two exist)
- [ ] All port mappings in `docker-compose.test.yml` prefixed with `127.0.0.1:`
- [ ] `bun test` passes
- [ ] `docker compose config` validates

## Verification

- `bun test` — all control-plane tests pass including new ALLOW_DEV_DEFAULTS tests
- `docker compose config` — exits 0
- `docker compose -f docker-compose.yml -f docker-compose.test.yml config` — exits 0
- `rg "signing_keys:/data/keys:ro" docker-compose.yml` — matches
- `rg "127\.0\.0\.1:" docker-compose.test.yml` — matches all port lines

## Inputs

- `control-plane/src/config.ts` — `loadConfig()` function with `requireEnv()` calls. Current pattern: `isProduction ? undefined : "fallback"`. `isProduction` is `const isProduction = process.env.NODE_ENV === "production"` at module scope. Has 5 env vars with dev fallbacks: DATABASE_URL, CLICKHOUSE_URL, CLICKHOUSE_DATABASE, WASM_STORAGE_DIR, OPA_BINARY_PATH.
- `control-plane/src/config.test.ts` — existing config tests (check patterns for env var manipulation).
- `docker-compose.yml` — evidence-collector has `signing_keys:/data/keys` (no `:ro`). Two occurrences of `signing_keys:/data/keys` in the file.
- `docker-compose.test.yml` — port mappings use `!override` with ports like `"15432:5432"`, `"18123:8123"`, `"19000:9000"`, `"19001:9001"`, `"13001:3000"`, `"18443:8443"`. All need `127.0.0.1:` prefix.

## Observability Impact

- **Config startup errors:** Missing required env vars without `ALLOW_DEV_DEFAULTS=true` produce descriptive `Error: Required environment variable <NAME> is not set` on stderr at process startup. A future agent can detect this by running `bun run src/index.ts` with no env vars and checking exit code + stderr.
- **Dev fallback activation:** When `ALLOW_DEV_DEFAULTS=true` is set, `loadConfig()` silently uses fallback values. There is no log line for this — absence of the startup error is the signal. A diagnostic agent can verify by checking `loadConfig()` return values in a test.
- **Docker volume `:ro` violations:** If a container attempts to write to a read-only `signing_keys` volume, it produces `EROFS` (read-only filesystem) errors in container logs. Detectable via `docker logs <container>`.
- **Localhost-bound ports:** `127.0.0.1:` prefix in test compose ports means the test databases are not reachable from other machines. If a remote test runner can't connect, `docker compose config` output will show the binding.

## Expected Output

- `control-plane/src/config.ts` — dev fallbacks gated behind `ALLOW_DEV_DEFAULTS=true`
- `control-plane/src/config.test.ts` — 4+ new tests for ALLOW_DEV_DEFAULTS gating
- `docker-compose.yml` — signing_keys volume `:ro`
- `docker-compose.test.yml` — all ports prefixed with `127.0.0.1:`
