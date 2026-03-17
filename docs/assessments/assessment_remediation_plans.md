# Assessment Remediation Plans — v1.6 → v1.7

**Source:** `final_assessment.md` (2026-03-15)  
**Scope:** All 41 findings (4 HIGH, 12 MEDIUM, 25 LOW) + 4 systemic gaps  
**Organization:** 6 slices, ordered by risk

---

## Slice Overview

| Slice | Title | Risk | Findings Covered | Est |
|-------|-------|------|------------------|-----|
| S01 | Evidence Pipeline Resilience | high | H-01, H-02, M-02, M-03, L-04 | 3h |
| S02 | Security Hardening — Proxy, Helm, Secrets | high | H-03, H-04, M-06, M-09, M-10, L-13, L-17, L-20, L-21 | 2h |
| S03 | Auth, Rate Limiting & Session Fixes | medium | M-01, M-05, L-05, L-06, L-07, L-23, L-24 | 2h |
| S04 | Dashboard Quality & Accessibility | medium | M-04, L-08, L-09, L-10, L-11, L-12 | 1.5h |
| S05 | Infrastructure & CI Hardening | medium | M-07, M-08, L-14, L-15, L-16, L-18, L-19, L-22, L-25 | 1.5h |
| S06 | Proto Safety, Observability & Testing | medium | M-11, M-12, L-01, L-02, L-03, systemic gaps | 2h |

**Total estimated: ~12 hours**

---

## S01: Evidence Pipeline Resilience

**Risk:** high  
**Depends:** none  
**Findings:** H-01, H-02, M-02, M-03, L-04

### Context

The evidence pipeline is the most critical data path in the system — every audit trail record flows through it. Currently, ClickHouse write failures silently drop evidence rows, S3 anchor failures permanently lose Merkle roots, retention TTL is hardcoded despite being configurable, and replayed bundles can corrupt chain verification. These gaps collectively put audit trail integrity at risk.

### Tasks

#### T01: ClickHouse Writer Retry Logic + Dead Letter Queue
**Fixes:** H-01, L-04  
**File:** `crates/evidence-collector/src/storage/clickhouse.rs`  
**Est:** 1.5h

**Current behavior:** `run_inserter_worker()` at line 149 logs ClickHouse `write()`/`commit()` errors and `continue`s — the evidence row is permanently lost. The gRPC caller received `Ok()` when the row entered the mpsc channel, so it believes delivery succeeded.

**Plan:**

1. **Add retry logic to `run_inserter_worker()`:**
   - On `inserter.write()` or `inserter.commit()` failure, push the failed `EvidenceRow` into a `VecDeque<Box<EvidenceRow>>` retry buffer (capacity: 1000)
   - Before processing new rows from the channel, drain up to 10 retry entries first
   - Use exponential backoff between retry attempts: 100ms, 200ms, 400ms, 800ms, 1.6s (5 attempts max per row)
   - Track retry count per row via a wrapper: `struct RetryableRow { row: Box<EvidenceRow>, attempts: u8 }`

2. **Add dead-letter spillover on retry exhaustion:**
   - After 5 failed attempts, write the row as JSON to a dead-letter file: `{data_dir}/dead-letter/evidence-{timestamp}-{bundle_id}.json`
   - Create the dead-letter directory at startup
   - Log `tracing::error!("[evidence] Row exhausted retries, written to dead-letter: {path}")`
   - Track `dead_letter_count` in a counter for health monitoring

3. **Make inserter batch settings configurable (L-04):**
   - Add env vars: `COLLECTOR_CH_MAX_ROWS` (default 1000), `COLLECTOR_CH_PERIOD_MS` (default 1000), `COLLECTOR_CH_MAX_BYTES` (default 50_000_000)
   - Read from `CollectorConfig` and pass to `ClickHouseWriter::new()`

4. **Add health surface:**
   - Add a `WriterHealth` struct: `{ rows_written: u64, rows_retried: u64, rows_dead_lettered: u64, last_error: Option<String>, last_success_at: Option<DateTime<Utc>> }`
   - Expose via `ClickHouseWriter::health()` method
   - Log periodic health summary every 60 seconds when non-zero retry/dead-letter counts

**Tests:**
- Unit test: retry logic processes failed rows before new rows
- Unit test: row moves to dead-letter after 5 failures
- Unit test: configurable batch settings are respected
- Unit test: health counters update correctly

**Verification:** `cargo test -p evidence-collector --lib` passes. `cargo clippy -p evidence-collector -- -D warnings` clean.

---

#### T02: S3 Merkle Anchor Retry + Local Persistence
**Fixes:** H-02  
**File:** `crates/evidence-collector/src/merkle/builder.rs`  
**Est:** 45m

**Current behavior:** `do_rotate()` at line 117 calls `guard.finalize()` + `guard.reset()` which produces the anchor and immediately resets the tree. Then it attempts `s3.anchor_merkle_root()`. If S3 fails, the anchor is logged but permanently lost — the tree is already reset.

**Plan:**

1. **Persist anchor locally before attempting S3:**
   - Before calling `guard.reset()`, serialize the `MerkleAnchor` to JSON and write to `{data_dir}/merkle-anchors/{hour_iso}.json`
   - Only call `guard.reset()` after the local write succeeds
   - If local write fails, log error but do NOT reset — keep accumulating into the current tree (bounded by overflow)

2. **Add retry logic to S3 anchor write:**
   - Wrap `s3.anchor_merkle_root()` in a retry loop: 3 attempts with 1s, 2s, 4s backoff
   - On final failure, the anchor is already persisted locally — log at `error!` level with the path to the local file
   - Add `tracing::warn!("[merkle] S3 anchor failed, persisted locally: {path}")`

3. **Add startup recovery:**
   - On evidence-collector startup, scan `{data_dir}/merkle-anchors/` for unannotated files
   - For each, attempt S3 upload with the same `anchor_merkle_root()` call
   - On success, rename file to `{hour_iso}.anchored.json`
   - Log recovery count: `[merkle] Recovered N pending anchors to S3`

4. **Add health surface:**
   - Track `last_anchor_at`, `pending_local_anchors`, `failed_anchor_count`
   - Expose via `MerkleBuilder::anchor_health()` method

**Tests:**
- Unit test: anchor is persisted locally before S3 attempt
- Unit test: tree is not reset if local persistence fails
- Unit test: retry logic attempts 3 times on S3 failure
- Unit test: startup recovery scans and re-uploads

**Verification:** `cargo test -p evidence-collector --lib` passes.

---

#### T03: ClickHouse Retention TTL Uses Config + Bundle Dedup
**Fixes:** M-02, M-03  
**File:** `crates/evidence-collector/src/storage/clickhouse.rs`, `crates/evidence-collector/src/grpc/service.rs`  
**Est:** 45m

**Plan for M-02 (retention TTL):**

1. **Parameterize DDL TTL with config value:**
   - Change the `table_ddl()` function to accept `retention_days: u32`
   - Replace hardcoded `INTERVAL 7 YEAR` with `INTERVAL {retention_days} DAY`
   - Pass `config.retention_days` through from `ClickHouseWriter::new()`
   - Add a migration DDL: `ALTER TABLE evidence_bundles MODIFY TTL event_date + INTERVAL {N} DAY DELETE` — runs at startup alongside existing migrations (idempotent)

**Plan for M-03 (bundle dedup):**

1. **Add a per-kernel sequence number tracking set in the gRPC service:**
   - In `EvidenceService`, add `seen_sequences: DashMap<String, HashSet<u64>>` — tracks `(kernel_id, sequence_number)` pairs
   - Before processing a bundle in `process_bundle()`, check if `(kernel_id, sequence_number)` is already seen
   - If duplicate: log `tracing::warn!("[evidence] Duplicate bundle rejected: kernel={}, seq={}")`, increment `rejected_count`, skip row
   - Bound the `seen_sequences` map: evict entries for kernels not seen in 1 hour

2. **Add ClickHouse dedup at query level:**
   - Add `ReplacingMergeTree` engine consideration — but since this changes the existing table engine, prefer application-level dedup + document ClickHouse-level dedup as future improvement

**Tests:**
- Unit test: DDL contains the configured retention days
- Unit test: migration DDL uses the correct interval
- Unit test: duplicate `(kernel_id, sequence_number)` is rejected
- Unit test: non-duplicate bundles are accepted normally

**Verification:** `cargo test -p evidence-collector` passes.

---

## S02: Security Hardening — Proxy, Helm, Secrets

**Risk:** high  
**Depends:** none  
**Findings:** H-03, H-04, M-06, M-09, M-10, L-13, L-17, L-20, L-21

### Tasks

#### T01: BFF Proxy Path Allowlist + Body Size Limit
**Fixes:** H-03  
**File:** `dashboard/src/app/api/proxy/[...path]/route.ts`  
**Est:** 30m

**Plan:**

1. **Add a path allowlist at the top of the proxy file:**
   ```typescript
   const ALLOWED_PREFIXES = [
     "policies", "vendors", "regulatory", "audit", "anomalies",
     "reviews", "reports", "evidence", "department-overrides",
     "signing-keys", "session", "dashboard", "health"
   ];
   ```
   - Before forwarding, check `ALLOWED_PREFIXES.some(p => targetPath.startsWith(p))`
   - If not matched, return `403 { success: false, error: { message: "Forbidden proxy path" } }`
   - Log the blocked path at `warn` level for security monitoring

2. **Add body size limit:**
   - Before forwarding non-GET requests, check `Content-Length` header
   - If `Content-Length > 2MB` (or configurable via `PROXY_MAX_BODY_BYTES` env var), return 413
   - If no `Content-Length` header, read body with streaming limit

3. **Add tests:**
   - Test: allowed path forwards correctly
   - Test: disallowed path returns 403
   - Test: path traversal attempt (e.g., `../internal`) returns 403
   - Test: oversized body returns 413

**Verification:** `cd dashboard && npx vitest run` passes.

---

#### T02: Helm Required Value Guards
**Fixes:** H-04, M-10  
**File:** `helm/interdict/templates/_helpers.tpl`, `helm/interdict/values.yaml`  
**Est:** 30m

**Plan:**

1. **Add required value checks to `_helpers.tpl`:**
   ```yaml
   {{- define "interdict.validateRequired" -}}
   {{- if and (not .Values.postgresql.auth.existingSecret) (eq .Values.postgresql.auth.password "") -}}
   {{- fail "postgresql.auth.password is required when postgresql.auth.existingSecret is not set. Set with --set postgresql.auth.password=<value>" -}}
   {{- end -}}
   {{- if and (not .Values.evidenceCollector.aws.existingSecret) (eq .Values.evidenceCollector.aws.secretAccessKey "") -}}
   {{- fail "evidenceCollector.aws.secretAccessKey is required when evidenceCollector.aws.existingSecret is not set" -}}
   {{- end -}}
   {{- end -}}
   ```

2. **Invoke from a ConfigMap or Deployment template:**
   - Add `{{ include "interdict.validateRequired" . }}` in the control-plane deployment template (runs during render)

3. **Update values.yaml comments:**
   - Add `# REQUIRED — set via --set or existingSecret` comments next to password fields
   - Change AWS defaults from `""` to include comment: `# Use existingSecret for production`

4. **Add tests:**
   - `helm template --set postgresql.auth.password=""` → fails with clear error
   - `helm template --set postgresql.auth.password=secret123` → succeeds
   - `helm template --set postgresql.auth.existingSecret=my-secret` → succeeds (bypasses check)

**Verification:** `helm lint helm/interdict` passes. `helm template` with empty password fails.

---

#### T03: Helm ConfigMap Secrets Cleanup + DATABASE_URL
**Fixes:** M-06  
**File:** `helm/interdict/templates/control-plane/configmap.yaml`, `helm/interdict/templates/control-plane/deployment.yaml`  
**Est:** 20m

**Plan:**

1. **Remove `DATABASE_URL` from ConfigMap entirely**
2. **Construct `DATABASE_URL` in the Deployment env block:**
   - Use Kubernetes variable expansion in the env spec:
   ```yaml
   - name: POSTGRES_PASSWORD
     valueFrom:
       secretKeyRef: ... # or value from values
   - name: DATABASE_URL
     value: "postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):$(POSTGRES_PORT)/$(POSTGRES_DB)"
   ```
   - This keeps the password reference in the env block where `$(...)` expansion works correctly

3. **Verify no other templates reference DATABASE_URL from the ConfigMap**

**Verification:** `helm template` renders correct DATABASE_URL in deployment env. No password in ConfigMap.

---

#### T04: Config Dev Fallback, Volume Mounts, Image Pins, Test Compose, Secret Rotation
**Fixes:** M-09, L-13, L-17, L-20, L-21  
**Est:** 30m

**Plan for M-09 (dev DB fallback):**
- File: `control-plane/src/config.ts:38-39`
- Replace unconditional fallback with explicit opt-in:
  ```typescript
  databaseUrl: process.env.DATABASE_URL 
    ?? (process.env.ALLOW_DEV_DEFAULTS === "true" 
        ? "postgres://interdict:interdict@localhost:5432/interdict" 
        : (() => { throw new Error("DATABASE_URL is required"); })()),
  ```
- Add `ALLOW_DEV_DEFAULTS=true` to `env.example` with comment explaining it's for local dev only
- Update `docker-compose.yml` to set `DATABASE_URL` explicitly (it already does via env)

**Plan for L-13 (signing_keys read-only):**
- File: `docker-compose.yml:260`
- Change evidence-collector volume mount from `signing_keys:/data/keys` to `signing_keys:/data/keys:ro`

**Plan for L-17 (busybox digest pin):**
- File: `helm/interdict/templates/kernel/deployment.yaml:28` (and 3 others)
- Look up `busybox:1.36` manifest-list digest via Docker Hub API
- Replace `image: busybox:1.36` with `image: busybox:1.36@sha256:<digest>` in all 4 deployment templates
- Add `busybox` to Renovate docker group for automated digest tracking

**Plan for L-20 (rotate OpenAI key):**
- Delete the real key from `scripts/test/.env.test`
- Replace with `OPENAI_API_KEY=sk-test-placeholder-rotate-me`
- Add a note: `# Never commit real API keys. Copy from .env.test.example and fill in.`
- **Separately:** User must rotate the key on the OpenAI dashboard (flag to user)

**Plan for L-21 (test compose ports):**
- File: `docker-compose.test.yml`
- Bind test ports to `127.0.0.1` instead of `0.0.0.0`:
  ```yaml
  ports:
    - "127.0.0.1:15432:5432"
    - "127.0.0.1:18123:8123"
  ```

**Tests:**
- `bun test src/config.test.ts` — test that missing DATABASE_URL without ALLOW_DEV_DEFAULTS throws
- `docker compose config` — validates updated mounts and ports
- `helm template` — shows busybox with digest pin

**Verification:** All config, compose, and helm checks pass.

---

## S03: Auth, Rate Limiting & Session Fixes

**Risk:** medium  
**Depends:** none  
**Findings:** M-01, M-05, L-05, L-06, L-07, L-23, L-24

### Tasks

#### T01: Extend Rate Limiting to Write Endpoints
**Fixes:** M-01  
**Files:** `control-plane/src/modules/*/index.ts`, `control-plane/src/modules/auth/rate-limiter.ts`  
**Est:** 45m

**Plan:**

1. **Create a second rate limiter instance for general API use:**
   - `apiRateLimiter` — higher threshold: 60 requests/min per IP (vs 10/min for auth)
   - Reuse existing `RateLimiter` class, just different config
   - ENV: `API_RATE_LIMIT_MAX` (default 60), `API_RATE_LIMIT_WINDOW_MS` (default 60000)

2. **Apply to expensive write endpoints:**
   - `POST /policies` (create policy)
   - `POST /policies/:id/compile` (trigger compilation)
   - `POST /reports/generate` (generate PDF/CSV)
   - `POST /signing-keys/rotate` (rotate signing key)
   - `POST /vendors` (create vendor)
   - `POST /evidence/verify` (verify evidence — CPU-intensive)

3. **Wire in `index.ts` startup:**
   - Create `apiRateLimiter` alongside `authRateLimiter`
   - Pass to each module's route factory
   - Add `beforeHandle: createRateLimitHook(apiRateLimiter)` to the target routes

4. **Tests:**
   - Test: write endpoint returns 429 after 60 requests in 1 minute
   - Test: read endpoints are not affected
   - Test: auth rate limiter (10/min) and API rate limiter (60/min) are independent

**Verification:** `cd control-plane && bun test` passes.

---

#### T02: SAML SLO Session Revocation + IP Fallback + Schema/Dead Code Cleanup
**Fixes:** M-05, L-05, L-06, L-07, L-23, L-24  
**Est:** 45m

**Plan for M-05 (SAML SLO session revocation):**
- File: `dashboard/src/lib/auth-client.ts:37-45`
- Before redirecting to IdP SLO URL, call `/api/auth/logout` first:
  ```typescript
  export async function logout(samlSloUrl?: string) {
    // Always revoke server session first
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort — continue with redirect even if revocation fails
    }
    
    if (samlSloUrl) {
      window.location.href = samlSloUrl;
    } else {
      window.location.href = "/login";
    }
  }
  ```

**Plan for L-05 (review ingest auth):**
- File: `control-plane/src/modules/reviews/index.ts:59-85`
- Create a `serviceOnly` auth option: `{ auth: "service" }` that checks `isService` at middleware level
- Or simpler: add `{ auth: ["super_admin"] }` and check `isService` as an additional guard
- Keep backward compatibility — this is a defense-in-depth improvement

**Plan for L-06 (rate limiter IP fallback):**
- File: `control-plane/src/modules/auth/rate-limiter.ts:150-154`
- Change IP extraction to check: `x-forwarded-for` → `x-real-ip` → Bun socket `remoteAddress` → `"unknown"`
- For Elysia/Bun: `(request as any).socket?.remoteAddress` or `server.requestIP(request)?.address`
- This ensures non-proxied clients each get their own rate limit bucket

**Plan for L-07 (department FK):**
- File: `control-plane/src/db/schema/organization.ts:17`
- Add self-referencing FK: `.references(() => departments.id)`
- Create a migration to add the FK constraint (may need to check existing data for orphans first)

**Plan for L-23 (dead rolePermissions table):**
- File: `control-plane/src/db/schema/auth.ts:145-155`
- Remove the `rolePermissions` table definition
- Check for any migration files that create it — keep the migration file but mark as historical
- If Drizzle migrations auto-generate, the next push would drop the table — verify no data exists first
- Alternative: add a comment `// Reserved for future enterprise custom permissions` if keeping

**Plan for L-24 (dead session max age constant):**
- File: `control-plane/src/modules/auth/saml/handlers.ts:28`
- Remove `_SESSION_MAX_AGE_SECONDS` constant
- The actual session expiry is managed in `service.ts:createSession()`

**Tests:**
- Test: SAML logout calls `/api/auth/logout` before redirect (mock fetch)
- Test: rate limiter uses socket IP when x-forwarded-for absent
- Test: department with invalid parent FK is rejected (if FK added)

**Verification:** `bun test` and `npx vitest run` pass.

---

## S04: Dashboard Quality & Accessibility

**Risk:** medium  
**Depends:** none  
**Findings:** M-04, L-08, L-09, L-10, L-11, L-12

### Tasks

#### T01: Fix Render-Phase Side Effects
**Fixes:** M-04  
**Est:** 20m

**Plan for dashboard home page (`app/(dashboard)/page.tsx:36-40`):**
- Remove `queueMicrotask(() => setLastUpdated(...))` from render body
- Wrap in `useEffect`:
  ```typescript
  useEffect(() => {
    if (violations.dataUpdatedAt) {
      setLastUpdated(violations.dataUpdatedAt);
    }
  }, [violations.dataUpdatedAt]);
  ```

**Plan for ReviewQueue (`components/reviews/ReviewQueue.tsx:113-115`):**
- Remove `onStatsUpdate(data.stats)` from render body
- Wrap in `useEffect`:
  ```typescript
  useEffect(() => {
    if (data?.stats) {
      onStatsUpdate(data.stats);
    }
  }, [data?.stats, onStatsUpdate]);
  ```
- Ensure `onStatsUpdate` is wrapped in `useCallback` at the call site to prevent infinite effect loops

**Tests:**
- Existing tests should still pass (behavior unchanged)
- Verify no React strict mode warnings in dev

**Verification:** `npx vitest run` passes.

---

#### T02: Cookie Consistency + SLA Timer Performance + Accessibility Fixes
**Fixes:** L-08, L-09, L-10, L-11, L-12  
**Est:** 40m

**Plan for L-08 (SAML callback cookie):**
- File: `dashboard/src/app/api/auth/saml-callback/route.ts:53-58`
- Replace hardcoded cookie options with `getSessionCookieOptions()`:
  ```typescript
  import { getSessionCookieOptions } from "@/lib/auth";
  // ...
  cookies().set("interdict_session", sessionToken, getSessionCookieOptions());
  ```

**Plan for L-09 (SlaTimer shared interval):**
- File: `dashboard/src/components/reviews/SlaTimer.tsx`
- Replace per-instance `setInterval(1000)` with a shared timer approach:
  - Create a module-level `useSyncExternalStore`-based tick hook or a simple shared ref:
    ```typescript
    // Module-level shared tick
    let tickListeners = new Set<() => void>();
    let tickInterval: NodeJS.Timeout | null = null;
    
    function subscribeTick(listener: () => void) {
      tickListeners.add(listener);
      if (!tickInterval) {
        tickInterval = setInterval(() => tickListeners.forEach(l => l()), 1000);
      }
      return () => {
        tickListeners.delete(listener);
        if (tickListeners.size === 0 && tickInterval) {
          clearInterval(tickInterval);
          tickInterval = null;
        }
      };
    }
    ```
  - Each `SlaTimer` subscribes via `useSyncExternalStore(subscribeTick, getSnapshot)`
  - 50 timers → 1 interval instead of 50

**Plan for L-10 (BatchVerifyTable checkboxes):**
- File: `dashboard/src/components/evidence/BatchVerifyTable.tsx:97-107`
- Add `aria-label` to select-all checkbox: `aria-label="Select all evidence bundles"`
- Add `aria-label` to per-row checkboxes: `aria-label={`Select bundle ${row.bundleId}`}`
- Consider using the UI library's `Checkbox` component for consistency

**Plan for L-11 (VendorCard aria-expanded):**
- File: `dashboard/src/components/vendors/VendorCard.tsx:44-48`
- Add `aria-expanded={showModels}` to the "Show models" button
- Add `aria-controls="models-{vendorId}"` and `id="models-{vendorId}"` on the collapsible panel

**Plan for L-12 (anomalies tab ARIA):**
- File: `dashboard/src/app/(dashboard)/anomalies/page.tsx:72-85`
- Wrap the filter buttons in a `<div role="tablist">`:
  ```tsx
  <div role="tablist" aria-label="Severity filter">
    {severities.map(sev => (
      <button
        key={sev}
        role="tab"
        aria-selected={selectedSeverity === sev}
        onClick={() => setSelectedSeverity(sev)}
      >
        {sev}
      </button>
    ))}
  </div>
  ```

**Tests:**
- Test: SlaTimer renders correctly (existing tests)
- Test: BatchVerifyTable checkboxes have aria-labels (axe-core or query by label)
- Test: VendorCard toggle has aria-expanded (check attribute after click)
- Test: anomaly tabs have correct ARIA roles

**Verification:** `npx vitest run` passes. No axe-core violations added.

---

## S05: Infrastructure & CI Hardening

**Risk:** medium  
**Depends:** none  
**Findings:** M-07, M-08, L-14, L-15, L-16, L-18, L-19, L-22, L-25

### Tasks

#### T01: Docker Compose cert-init Hardening + Network Fix
**Fixes:** M-07, L-14  
**File:** `docker-compose.yml`  
**Est:** 20m

**Plan for M-07 (cert-init root):**
- Add `user: "1000:1000"` to the cert-init service
- Use the same `apk --root /tmp/apkroot` technique proven in the Helm chart (S05/D053):
  ```yaml
  cert-init:
    image: alpine:3.21@sha256:<digest>
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp:size=16M
    security_opt:
      - no-new-privileges:true
    command: >
      sh -c "
        apk --root /tmp/apkroot --initdb add openssl &&
        export PATH=/tmp/apkroot/usr/bin:$$PATH &&
        ... existing cert generation logic ...
      "
  ```

**Plan for L-14 (cert-init network isolation):**
- Remove cert-init from the `data` network
- It only needs the `certs` volume — no network access required
- If it needs no network at all, add `network_mode: "none"` (prevents any outbound access)

**Verification:** `docker compose config` validates. `GRAFANA_ADMIN_PASSWORD=test docker compose config` exits 0.

---

#### T02: CI Binary Integrity Verification
**Fixes:** M-08  
**File:** `.github/workflows/ci-quality-security.yml`  
**Est:** 20m

**Plan:**

1. **Add SHA256 checksum for hadolint (lines 104-109):**
   - Look up the checksum from hadolint's GitHub release page
   - Add an ARG-style pattern matching the OPA Dockerfile approach:
     ```yaml
     - name: Install hadolint
       env:
         HADOLINT_VERSION: v2.12.0
         HADOLINT_SHA256: "56de6d5e5ec427e17571d6b4ae7c2e51d0c1cae1..." 
       run: |
         curl -fsSL "https://github.com/hadolint/hadolint/releases/download/${HADOLINT_VERSION}/hadolint-Linux-x86_64" -o hadolint
         echo "${HADOLINT_SHA256}  hadolint" | sha256sum -c -
         chmod +x hadolint
         sudo mv hadolint /usr/local/bin/hadolint
     ```

2. **Add SHA256 checksum for kube-score (lines 121-128):**
   - Same pattern: download, verify checksum, then install
   - For tar.gz archives, verify the archive checksum before extraction

**Verification:** CI workflow yaml is valid. `yamllint -d relaxed .github/workflows/*.yml` passes (warnings only).

---

#### T03: Helm Security Contexts + Dockerfile + Cargo Lints + Misc
**Fixes:** L-15, L-16, L-18, L-19, L-22, L-25  
**Est:** 30m

**Plan for L-15 (minio-init security context):**
- File: `helm/interdict/templates/minio-init-job.yaml:51-55`
- Add missing fields to the container securityContext:
  ```yaml
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: [ALL]
  ```
- Add a tmpfs volume for `/tmp` if the mc CLI needs temp space

**Plan for L-16 (sidecar-init capabilities):**
- File: `helm/interdict/templates/sidecar/_sidecar-init.tpl:26-32`
- The iptables init container must run as root with NET_ADMIN — this is architecturally required
- Add: `readOnlyRootFilesystem: true` + tmpfs for /tmp
- Add: `capabilities: { drop: [ALL], add: [NET_ADMIN] }` — explicitly drop everything and add back only NET_ADMIN
- Add a comment documenting why this container requires elevated privileges

**Plan for L-18 (devDependencies in production image):**
- File: `docker/control-plane/Dockerfile:28-30`
- Split into two stages: one for migrations (with devDeps), one for runtime (production only):
  ```dockerfile
  # Stage: install all deps (for migrations)
  FROM base AS deps-all
  COPY package.json bun.lockb ./
  RUN bun install --frozen-lockfile

  # Stage: production deps only
  FROM base AS deps-prod  
  COPY package.json bun.lockb ./
  RUN bun install --frozen-lockfile --production

  # Stage: runtime
  FROM base AS runtime
  COPY --from=deps-prod /app/node_modules ./node_modules
  # ... migration runs as a separate init container using deps-all image
  ```
- If migration must run in the same image, keep current approach but add a comment explaining why

**Plan for L-19 (unsafe_code lint level):**
- File: `Cargo.toml:11`
- Change from `unsafe_code = "warn"` to `unsafe_code = "deny"`
- Add per-crate exception in `crates/kernel/Cargo.toml`:
  ```toml
  [lints.rust]
  unsafe_code = "allow"  # Required for wasmtime module deserialization + jemalloc
  ```
- This ensures any new crate with accidental unsafe code gets a compile error

**Plan for L-22 (stale cert comment):**
- File: `docker/certs/generate-internal-ca.sh:17`
- Update header comment from "10-year validity" to "1-year validity (365 days)"
- Check `helm/interdict/templates/configmap-cert-script.yaml` for the same stale comment

**Plan for L-25 (lint-staged Rust):**
- File: `package.json:19`
- Replace echo no-op with actual cargo fmt check:
  ```json
  "crates/**/*.rs": ["cargo fmt --all -- --check"]
  ```
- If Windows path issues prevent cargo fmt in lint-staged (known issue), add a comment explaining why it's deferred to CI, but make the echo more honest: `"echo 'Rust formatting checked in CI — run cargo fmt locally'"`

**Verification:** `helm lint`, `cargo clippy --workspace`, `docker compose config` all pass.

---

## S06: Proto Safety, Observability & Testing

**Risk:** medium  
**Depends:** S01  
**Findings:** M-11, M-12, L-01, L-02, L-03, systemic gaps (observability, integration test, vitest mock)

### Tasks

#### T01: Deprecated Proto Field Size Reduction + Flaky Test Fix
**Fixes:** M-11, L-01, L-02, L-03  
**Est:** 45m

**Plan for M-11 (deprecated field size):**
- File: `proto/interdict/evidence/v1/evidence.proto:65,72`
- Reduce `max_len` on deprecated fields from 1MB to 0:
  ```protobuf
  string prompt_text = 10 [
    deprecated = true,
    (buf.validate.field).string.max_len = 0
  ];
  ```
- This makes the fields effectively unusable via validation — any non-empty value is rejected
- Alternative if `max_len = 0` isn't supported: set to 1 byte, effectively preventing real content
- Update the deprecation comment: `// DEPRECATED: Will be removed in v2.0. Field is validation-rejected.`
- Run `buf lint` and `buf build` to verify
- Run `cargo build -p kernel -p evidence-collector` to verify proto codegen

**Plan for L-01 (flaky test):**
- File: `crates/kernel/src/policy/layer3/queue.rs:437`
- Replace `tokio::time::sleep(Duration::from_millis(50))` with a notification channel:
  ```rust
  // Add a oneshot channel that signals when the permit is acquired
  let (permit_acquired_tx, permit_acquired_rx) = oneshot::channel::<()>();
  
  // In the spawned escalation task, signal after acquiring the permit
  // ... acquire permit ...
  let _ = permit_acquired_tx.send(());
  // ... wait for review response ...
  
  // In the test, wait for the signal instead of sleeping
  permit_acquired_rx.await.unwrap();
  ```
- This makes the test deterministic regardless of CPU load

**Plan for L-02 (timestamp nanos cast):**
- File: `crates/evidence-collector/src/grpc/service.rs:244`
- Replace `timestamp.nanos as u32` with:
  ```rust
  let nanos = u32::try_from(timestamp.nanos)
      .map_err(|_| anyhow!("invalid timestamp nanos: {}", timestamp.nanos))?;
  ```

**Plan for L-03 (PEM parsing):**
- File: `crates/evidence-collector/src/signing/local.rs:67-75`
- Add ASN.1 DER validation for PKCS#8 Ed25519 keys:
  ```rust
  // PKCS#8 Ed25519 private key DER has a known prefix (16 bytes)
  const PKCS8_ED25519_PREFIX: &[u8] = &[
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
      0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ];
  
  if decoded.len() == 48 && decoded.starts_with(PKCS8_ED25519_PREFIX) {
      // Valid PKCS#8 Ed25519 — extract 32-byte key at offset 16
      SigningKey::from_bytes(&decoded[16..48].try_into()?)
  } else if decoded.len() == 32 {
      // Raw 32-byte key
      SigningKey::from_bytes(&decoded.try_into()?)
  } else {
      Err(anyhow!("unrecognized key format: expected 32-byte raw or 48-byte PKCS#8 Ed25519"))
  }
  ```

**Tests:**
- Test: flaky test now passes deterministically (run 10 times in a loop)
- Test: negative nanos returns error
- Test: PKCS#8 Ed25519 key is parsed correctly
- Test: non-Ed25519 48-byte key is rejected

**Verification:** `cargo test --workspace --all-targets` — 293 pass, 0 fail. `buf lint` clean.

---

#### T02: Merkle Proof Generation + Collector→Verifier Integration Test
**Fixes:** M-12, systemic test gap  
**Est:** 45m

**Plan for M-12 (Merkle proof generation):**

1. **Add proof generation to `MerkleAnchor`:**
   - File: `crates/evidence-collector/src/merkle/builder.rs`
   - After computing the tree in `finalize()`, store the leaf hashes in the anchor:
     ```rust
     pub struct MerkleAnchor {
         pub hour: DateTime<Utc>,
         pub root: [u8; 32],
         pub bundle_count: usize,
         pub chain_hashes: Vec<[u8; 32]>,  // NEW: stored for proof generation
     }
     ```
   - Add method: `fn proof_for_bundle(&self, bundle_index: usize) -> Option<MerkleProof>`
   - Use `rs_merkle::MerkleTree::proof(&[index])`

2. **Add proof verification to interdict-verify:**
   - File: `crates/interdict-verify/src/merkle.rs`
   - Add `verify_proof(root: &[u8; 32], leaf: &[u8; 32], proof: &MerkleProof) -> bool`
   - Use `rs_merkle::MerkleProof::verify()`

3. **Persist proofs in anchor files:**
   - Include leaf hashes in the S3 anchor JSON so proofs can be reconstructed without all bundles

**Plan for collector→verifier integration test:**

1. **Create `crates/evidence-collector/tests/roundtrip_test.rs`:**
   - Construct 5 evidence bundles with known content
   - Process them through the collector's `process_bundle()` with an in-memory ClickHouse mock
   - Extract the signed, chained bundles
   - Pass them to `interdict-verify`'s chain, signature, and merkle verification functions
   - Assert all verifications pass
   - Mutate one bundle and assert chain verification fails

2. **Add interdict-verify as a dev-dependency of evidence-collector:**
   - It's already listed — just write the test

**Tests:**
- Test: proof generation produces valid proof for each bundle in a tree
- Test: proof verification succeeds for correct leaf
- Test: proof verification fails for wrong leaf
- Test: collector→verifier roundtrip passes for 5 valid bundles
- Test: collector→verifier roundtrip fails for tampered bundle

**Verification:** `cargo test --workspace --all-targets` passes.

---

#### T03: Observability Foundations + Vitest Mock Warning
**Fixes:** systemic observability gaps, vitest warning  
**Est:** 30m

**Plan for app-level metrics (systemic gap):**

1. **Add Prometheus metrics endpoint to evidence-collector:**
   - File: `crates/evidence-collector/src/main.rs`
   - Add `metrics` and `metrics-exporter-prometheus` crates
   - Expose `/metrics` HTTP endpoint on a separate port (e.g., 9090)
   - Key metrics:
     - `evidence_bundles_received_total` (counter)
     - `evidence_bundles_written_total` (counter)
     - `evidence_bundles_retried_total` (counter)
     - `evidence_bundles_dead_lettered_total` (counter)
     - `evidence_write_latency_seconds` (histogram)
     - `merkle_anchors_written_total` (counter)
     - `merkle_anchors_failed_total` (counter)
     - `signing_operations_total` (counter)

2. **Add Prometheus metrics to control-plane:**
   - Create `control-plane/src/modules/metrics/index.ts`
   - Use `prom-client` library
   - Expose `/metrics` endpoint (no auth required — Prometheus scrapes internally)
   - Key metrics:
     - `http_requests_total` (counter, labels: method, path, status)
     - `http_request_duration_seconds` (histogram)
     - `rate_limit_rejections_total` (counter)
     - `session_cleanup_rows_total` (counter)
     - `policy_compilations_total` (counter, labels: status)

3. **Update Prometheus config in `docker-compose.monitoring.yml`:**
   - Add scrape configs for evidence-collector and control-plane metrics endpoints

**Plan for vitest mock warning:**
- File: `dashboard/src/__tests__/helpers/next-mocks.ts`
- Move `vi.mock("next/headers")` to the top level of the file (outside any function)
- This fixes the warning: "A vi.mock call is not at the top level of the module"

**Verification:** `npx vitest run` passes with zero warnings. Metrics endpoints respond to `curl localhost:9090/metrics`.

---

## Cross-Cutting Verification

After all slices are complete, run the full verification suite:

```bash
# Rust
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo audit

# Control-plane
cd control-plane && bun test

# Dashboard
cd dashboard && npx vitest run

# Infrastructure
docker compose config
GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config
helm lint helm/interdict
helm template interdict helm/interdict --dependency-update
buf lint
shellcheck scripts/*.sh tests/integration/*.sh
```

**Definition of Done:** All 41 findings addressed with tests or structural verification. Zero new clippy warnings. Zero new test failures. All existing tests continue to pass.

---

## Finding → Task Map

| Finding | Slice | Task | Description |
|---------|-------|------|-------------|
| H-01 | S01 | T01 | ClickHouse writer retry + dead-letter |
| H-02 | S01 | T02 | S3 anchor retry + local persistence |
| H-03 | S02 | T01 | BFF proxy path allowlist + body limit |
| H-04 | S02 | T02 | Helm required password check |
| M-01 | S03 | T01 | Rate limiting on write endpoints |
| M-02 | S01 | T03 | ClickHouse TTL uses config retention_days |
| M-03 | S01 | T03 | Bundle ID deduplication |
| M-04 | S04 | T01 | Render-phase side effects → useEffect |
| M-05 | S03 | T02 | SAML SLO session revocation |
| M-06 | S02 | T03 | DATABASE_URL out of ConfigMap |
| M-07 | S05 | T01 | cert-init non-root + network isolation |
| M-08 | S05 | T02 | hadolint/kube-score SHA256 verification |
| M-09 | S02 | T04 | Dev DB fallback requires opt-in |
| M-10 | S02 | T02 | Helm AWS credential required checks |
| M-11 | S06 | T01 | Deprecated proto field max_len → 0 |
| M-12 | S06 | T02 | Merkle proof generation + verification |
| L-01 | S06 | T01 | Flaky test → notification channel |
| L-02 | S06 | T01 | timestamp.nanos safe cast |
| L-03 | S06 | T01 | PEM parsing ASN.1 validation |
| L-04 | S01 | T01 | ClickHouse inserter settings configurable |
| L-05 | S03 | T02 | Review ingest auth at middleware level |
| L-06 | S03 | T02 | Rate limiter IP fallback to socket addr |
| L-07 | S03 | T02 | Department self-referencing FK |
| L-08 | S04 | T02 | SAML callback shared cookie options |
| L-09 | S04 | T02 | SlaTimer shared interval |
| L-10 | S04 | T02 | BatchVerifyTable checkbox aria-labels |
| L-11 | S04 | T02 | VendorCard aria-expanded |
| L-12 | S04 | T02 | Anomalies tab ARIA roles |
| L-13 | S02 | T04 | signing_keys volume :ro |
| L-14 | S05 | T01 | cert-init network isolation |
| L-15 | S05 | T03 | minio-init security context |
| L-16 | S05 | T03 | sidecar-init capabilities drop |
| L-17 | S02 | T04 | busybox digest pin |
| L-18 | S05 | T03 | Dockerfile devDeps separation |
| L-19 | S05 | T03 | unsafe_code lint → deny |
| L-20 | S02 | T04 | Rotate OpenAI API key |
| L-21 | S02 | T04 | Test compose bind 127.0.0.1 |
| L-22 | S05 | T03 | Stale cert validity comment |
| L-23 | S03 | T02 | Dead rolePermissions table |
| L-24 | S03 | T02 | Dead _SESSION_MAX_AGE_SECONDS |
| L-25 | S05 | T03 | lint-staged Rust handler |
