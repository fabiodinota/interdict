# v1.3 Scan Remediation -- Phased Execution Roadmap

**Status:** complete in working tree
**Created:** 2026-03-10
**Scope:** Fix all High and Medium findings from the full-codebase scan (15 High, 31 Medium) across Rust, TypeScript, and deployment artifacts.

## Why This Milestone Exists

The v1.2 hardening milestone closed the gap between what Interdict claims and what it can prove. A comprehensive codebase scan identified 75 findings (15 High, 31 Medium, 29 Low/Info). This milestone systematically remediates all High and Medium findings to bring the codebase to production-grade quality across all three layers (Rust data plane, TypeScript control plane, deployment).

This milestone is a remediation milestone. No new features.

## Hard Ordering Rules

1. Phase 25 (Rust robustness) must complete before Phase 28 (evidence transit integrity depends on Rust panic removal).
2. Phase 26 (TypeScript type safety) and Phase 27 (auth/access control) can proceed in parallel.
3. Phase 28 (observability) depends on Phases 25-27 being stable.
4. Phase 29 (deployment) is last — it validates the whole stack.
5. Rust changes cannot be compiled on the current Windows machine. All Rust changes are verified structurally.

## Phase Summary

| Phase | Name | Primary Goal | Depends On | Estimated Findings |
| --- | --- | --- | --- | --- |
| 25 | Rust Robustness & Async Safety | Eliminate panics in production paths, fix async blocking, stop error leaks | none | 5 High, 9 Medium |
| 26 | TypeScript Type Eradication | Replace all `any` types in routes, services, and critical paths with proper types | none | 1 High, 9 Medium |
| 27 | Auth & Access Control Hardening | Add missing auth on routes, remove hardcoded credentials, fix URL fallbacks | none | 3 High, 2 Medium |
| 28 | Observability & Error Honesty | Fix error swallowing, add logging to fire-and-forget paths, normalize ClickHouse timestamps | 25, 26 | 3 High, 4 Medium |
| 29 | Deployment Completeness & Config Parity | Add healthchecks, fix config drift, add resource limits, add proto enum | 25-28 | 3 High, 7 Medium |

---

## Phase 25: Rust Robustness & Async Safety

**Goal:** No `expect()`/`panic!()` in production paths, no `std::sync::Mutex` in async, no internal error leaks to clients.

Backfilled execution artifact: `25-01-PLAN.md` (created from the active working-tree remediation on 2026-03-11).

### Tasks

#### 25.1 Remove panics from kernel startup (H-1)
- **File:** `crates/kernel/src/main.rs:82-83,113-115,140-141`
- **Issue:** `WasmEngine::new().expect()`, ONNX model `.expect()`, `ReviewQueueStore::new().expect()` — crash on misconfiguration instead of structured error.
- **Fix:** Replace all `.expect()` with `.context("...")?` using `anyhow`. Return `Result<()>` from `main()` or wrap in a `run()` function that returns Result.

#### 25.2 Remove panics from evidence-collector mTLS setup (H-2)
- **File:** `crates/evidence-collector/src/main.rs:139,143,147,150-154,163,174`
- **Issue:** Six `.expect()`/`panic!()` calls for mTLS cert loading.
- **Fix:** Replace with `.with_context(|| format!("..."))?`. Return `Result<()>` from main.

#### 25.3 Fix async-blocking SQLite Mutex (H-4)
- **File:** `crates/kernel/src/policy/layer3/store.rs`
- **Issue:** `std::sync::Mutex<rusqlite::Connection>` blocks Tokio worker thread.
- **Fix:** Switch to `tokio::sync::Mutex` and wrap SQLite I/O in `tokio::task::spawn_blocking`.

#### 25.4 Stop leaking internal errors to clients (H-5)
- **File:** `crates/kernel/src/proxy/connect.rs:736-737`
- **Issue:** `err.to_string()` returned to HTTP clients, leaking internal network topology.
- **Fix:** Return generic "upstream connection failed" message. Log actual error server-side.

#### 25.5 Fix blocking I/O in signing key watcher (M-1)
- **File:** `crates/evidence-collector/src/main.rs:209,220`
- **Issue:** `std::fs::metadata()` and `std::fs::read()` in async fn on Tokio runtime.
- **Fix:** Use `tokio::fs` or `tokio::task::spawn_blocking`.

#### 25.6 Validate timestamp before substitution (M-5)
- **File:** `crates/evidence-collector/src/grpc/service.rs:179`
- **Issue:** Missing/invalid bundle timestamps silently replaced with `Utc::now()`, corrupting audit trail.
- **Fix:** Reject bundles with missing or invalid timestamps; do not substitute or warn-and-accept malformed audit timestamps.

#### 25.7 Log rejected bundle errors (M-6)
- **File:** `crates/evidence-collector/src/grpc/service.rs:124-128`
- **Issue:** `process_bundle` failures silently counted as `rejected_count += 1` with no logging.
- **Fix:** Add `tracing::warn!("bundle rejected: {err}")` before incrementing counter.

#### 25.8 Validate kernel_id in gRPC stream (M-7)
- **File:** `crates/evidence-collector/src/grpc/service.rs:44,124`
- **Issue:** `kernel_id` from gRPC stream used as HashMap key without validation. Attacker can cause unbounded growth.
- **Fix:** Validate `kernel_id` against `[a-zA-Z0-9_-]{1,128}` regex. Reject bundles with invalid kernel_id.

#### 25.9 Make S3 Object Lock verification fatal in production (M-8)
- **File:** `crates/evidence-collector/src/storage/s3.rs:42-49`
- **Issue:** Object Lock verification failure only logs warning. Without WORM, Merkle anchors can be deleted.
- **Fix:** Add `require_object_lock` config flag (default true). When true, fail startup if Object Lock not configured.

#### 25.10 Fix relay direction mislabeling (M-9)
- **File:** `crates/kernel/src/proxy/relay.rs:167`
- **Issue:** `inspect_request()` called on response direction. Naming confusion could cause policy bypass.
- **Fix:** Rename to `inspect_response()` for the response direction, or use a `Direction` enum parameter.

#### 25.11 Sanitize ClickHouse database name (M-3)
- **File:** `crates/evidence-collector/src/storage/clickhouse.rs:64`
- **Issue:** `format!("CREATE DATABASE IF NOT EXISTS {database}")` — SQL injection via env var.
- **Fix:** Validate database name matches `[a-zA-Z0-9_]+` before interpolation.

#### 25.12 Sanitize ClickHouse URL in startup logs (M-4)
- **File:** `crates/evidence-collector/src/main.rs:31-37`
- **Issue:** `clickhouse_url` logged at startup may embed credentials.
- **Fix:** Redact URL credentials before logging (strip userinfo from URL).

### Exit Criteria
- Zero `.expect()` or `panic!()` in non-test production Rust code (except in clearly documented infallible positions).
- No `std::sync::Mutex` wrapping I/O in async contexts.
- No internal error strings returned to HTTP clients.
- All gRPC input fields validated before use.

---

## Phase 26: TypeScript Type Eradication

**Goal:** Eliminate all `any` types from routes, services, and critical paths. 90+ individual `any` occurrences resolved.

### Tasks

#### 26.1 Type all route handlers with RouteContext (H-6, M-1)
- **Files:** All route `index.ts` files across modules (policies, vendors, audit, evidence, regulatory, department-overrides, reviews, anomalies, compiler)
- **Issue:** `ctx: any` on every handler (27+ handlers identified in Phase 21 as intentionally preserved due to Elysia type inference). Auth middleware uses `ctx: any`.
- **Fix:** Import `RouteContext` from `shared/types.ts`. For auth middleware, type as `RouteContext` with proper `store` shape. For route handlers where Elysia inference breaks, use `as unknown as RouteContext` pattern consistently (already established in Phase 21). Document the Elysia limitation in a `// @elysia-type-workaround` comment.

#### 26.2 Type all service constructors with AppDb (M-2)
- **Files:** `policies/service.ts`, `vendors/service.ts`, `audit/service.ts`, `signing-keys/service.ts`, `evidence/service.ts`, `department-overrides/service.ts`
- **Issue:** `db: any` parameters on service constructors and class fields.
- **Fix:** Import `AppDb` from `shared/types.ts` and replace `any`.

#### 26.3 Type reports service data processing (M-3)
- **File:** `control-plane/src/modules/reports/service.ts`
- **Issue:** `rows: any[]`, `(p: any)`, `(r: any)` throughout ~10 locations in report generation.
- **Fix:** Define `ReportRow` interfaces for each report query. Type the `.map()` callbacks.

#### 26.4 Type gRPC distribution layer (M-4)
- **Files:** `distribution/server.ts`, `distribution/tracker.ts`
- **Issue:** Proto descriptor `as any`, handler params `any`, `grpc.ServerWritableStream<any, any>`.
- **Fix:** Generate TypeScript types from proto definitions or define them manually matching the proto schema.

#### 26.5 Type compiler validator error handling (M-5)
- **File:** `control-plane/src/modules/compiler/validator.ts:74,97`
- **Issue:** `(e: any)`, `catch (err: any)`.
- **Fix:** Use `unknown` and narrow with `instanceof Error`.

#### 26.6 Replace @ts-ignore with proper type declaration (M-7)
- **File:** `control-plane/src/modules/auth/saml/config.ts:13`
- **Issue:** `// @ts-ignore` for untyped package.
- **Fix:** Create a `*.d.ts` declaration file for the SAML package. Or use `@ts-expect-error` with a tracking comment.

#### 26.7 Type audit enrichment functions (M-14)
- **File:** `control-plane/src/modules/audit/enrichment.ts:49-50,123,145,167`
- **Issue:** `db: any` parameters on enrichment functions.
- **Fix:** Use `AppDb` type.

#### 26.8 Fix dashboard type issues (M-12, M-13)
- **Files:** `dashboard/src/hooks/use-dashboard-stats.ts:31,37`, `dashboard/src/app/(dashboard)/reports/page.tsx:30`
- **Issue:** Index signatures `[key: string]: unknown`, `as` type casts.
- **Fix:** Define explicit types for `PolicyItem`/`VendorItem`. Type the mutation return value properly.

#### 26.9 Add loading.tsx and error.tsx to dashboard routes (M-11)
- **Directory:** `dashboard/src/app/(dashboard)/`
- **Issue:** Zero `loading.tsx` and zero `error.tsx` files across 13 route segments.
- **Fix:** Create `loading.tsx` (skeleton/spinner) and `error.tsx` (error boundary with retry) for each major route segment.

### Exit Criteria
- `any` count in production (non-test) TypeScript reduced to zero outside documented Elysia workarounds.
- All route handlers either properly typed or annotated with `// @elysia-type-workaround`.
- Dashboard has loading and error boundaries for all route segments.
- `tsc --noEmit` passes with zero errors.

---

## Phase 27: Auth & Access Control Hardening

**Goal:** No unauthenticated control-plane routes, no hardcoded credentials in source, no hardcoded URLs as fallbacks.

### Tasks

#### 27.1 Add auth to compilation-status route (H-7)
- **File:** `control-plane/src/modules/compiler/index.ts:15-54`
- **Issue:** `GET /:id/compilation-status` has no `{ auth: true }` macro.
- **Fix:** Add auth requirement. Decide whether this is user-level or service-level auth.

#### 27.2 Add auth to review ingest endpoint (H-8)
- **File:** `control-plane/src/modules/reviews/index.ts:54-91`
- **Issue:** `POST /ingest` has no auth. Comment says "mTLS only" but no enforcement.
- **Fix:** Add service-level auth (API key or mTLS cert validation). If the endpoint is only called by evidence-collector, restrict to a service account.

#### 27.3 Remove hardcoded DB credentials from config (H-10)
- **File:** `control-plane/src/config.ts:47-48`
- **Issue:** `"postgres://interdict:interdict@localhost:5432/interdict"` as default.
- **Fix:** Require `DATABASE_URL` env var. Throw on missing in production mode; allow default in dev mode with a `NODE_ENV` check.

#### 27.4 Fix hardcoded SAML metadata URL (M-8)
- **File:** `control-plane/src/modules/auth/saml/config.ts:25-26`
- **Issue:** `"https://interdict.example.com/saml/metadata"` hardcoded.
- **Fix:** Move to `SAML_METADATA_URL` environment variable. Require it when SAML is enabled.

#### 27.5 Fix hardcoded localhost URLs in dashboard (M-9)
- **Files:** `dashboard/src/lib/auth-client.ts:24,38`, `dashboard/src/lib/auth.ts:11`
- **Issue:** `"http://localhost:3000"` as fallback for `NEXT_PUBLIC_APP_URL`.
- **Fix:** Require `NEXT_PUBLIC_APP_URL` or derive from request headers. Remove hardcoded fallback.

### Exit Criteria
- Every control-plane route has explicit auth or a documented exemption (e.g., health check).
- Zero hardcoded credentials in source code.
- Zero hardcoded domain URLs outside of documented dev-only defaults with `NODE_ENV` guards.

---

## Phase 28: Observability & Error Honesty

**Goal:** No silent error swallowing. All catch blocks either re-throw, return error state to caller, or log with context.

### Tasks

#### 28.1 Fix anomaly detection error swallowing (Arch-H-13)
- **File:** `control-plane/src/modules/anomalies/service.ts:71-74`
- **Issue:** All 4 anomaly queries use `.catch(() => [])`.
- **Fix:** Log errors before returning empty fallback. Add `warnings` array to response indicating which queries failed.

#### 28.2 Fix auth lastUsedAt error swallowing (H-11)
- **File:** `control-plane/src/modules/auth/service.ts:190-191`
- **Issue:** `.catch(() => {})` silently swallows DB failure.
- **Fix:** `.catch((err) => logger.warn("lastUsedAt update failed", { err }))`.

#### 28.3 Normalize ClickHouse timestamps (H-9)
- **File:** `control-plane/src/modules/evidence/service.ts:157`
- **Issue:** `new Date(c.timestamp).toISOString()` produces T/Z format for ClickHouse.
- **Fix:** Use `toChDateTime()` normalizer consistently across all ClickHouse queries.

#### 28.4 Add event_date partition filter to report queries (M-10)
- **File:** `control-plane/src/modules/reports/service.ts` (multiple queries)
- **Issue:** Queries filter by `timestamp` but miss `event_date` partition key.
- **Fix:** Add `event_date >= {start_date:Date} AND event_date <= {end_date:Date}` to all ClickHouse queries.

#### 28.5 Fix review service JSON parse error swallowing (Arch-M-3)
- **File:** `control-plane/src/modules/reviews/service.ts:485-487`
- **Issue:** `catch {}` swallowing JSON parse errors on `policy_rules_json`.
- **Fix:** Add `console.warn("[reviews] malformed policy_rules_json", { bundle_id })`.

#### 28.6 Fix distribution/compiler JSON parse swallowing (Arch-L-3)
- **Files:** `distribution/server.ts:161`, `compiler/worker.ts:256`
- **Issue:** Silent JSON parse error swallowing.
- **Fix:** Add debug-level warning with context.

#### 28.7 Introduce structured logger (Arch-L-2, stretch goal)
- **Scope:** `control-plane/src/` — 84 `console.log/error/warn` calls
- **Issue:** No structured JSON logging in TypeScript control-plane.
- **Fix:** If time permits, introduce a `pino` logger wrapper. Minimum: document this as a future improvement.

### Exit Criteria
- Zero bare `catch {}` or `.catch(() => {})` in production code.
- All ClickHouse timestamp parameters use `toChDateTime()`.
- All ClickHouse queries on `evidence_bundles` include `event_date` partition filter.

---

## Phase 29: Deployment Completeness & Config Parity

**Goal:** Docker Compose, Dockerfiles, Helm, env.example, and proto definitions are consistent and production-grade.

### Tasks

#### 29.1 Add healthchecks to docker-compose (Arch-H-12)
- **File:** `docker-compose.yml`
- **Issue:** Kernel, evidence-collector, and dashboard services have no healthcheck.
- **Fix:** Add `healthcheck` blocks: kernel (TCP 8443), evidence-collector (gRPC 50051), dashboard (HTTP 3001).

#### 29.2 Fix INTERDICT_EVIDENCE_COLLECTOR_ADDR config drift (Arch-H-14)
- **Files:** `env.example`, `docker-compose.yml`, `crates/kernel/src/main.rs`
- **Issue:** Dual naming — Rust reads `INTERDICT_EVIDENCE_COLLECTOR_ADDR`, env.example documents `KERNEL_EVIDENCE_COLLECTOR_ADDR`.
- **Fix:** Standardize on one name. Update all references.

#### 29.3 Fix NEXT_PUBLIC_API_URL port mismatch (Arch-H-15)
- **Files:** `env.example:171`, `docker-compose.yml:230`, `dashboard/src/lib/auth-client.ts`
- **Issue:** env.example says port 3000, docker-compose maps to 3001.
- **Fix:** Update env.example to port 3001. Add comment explaining the mapping.

#### 29.4 Add Dockerfile HEALTHCHECK instructions (Arch-M-5)
- **Files:** `docker/kernel/Dockerfile`, `docker/control-plane/Dockerfile`, `docker/evidence-collector/Dockerfile`
- **Issue:** Only dashboard Dockerfile has HEALTHCHECK.
- **Fix:** Add HEALTHCHECK to all service Dockerfiles.

#### 29.5 Add docker-compose resource limits (Arch-M-4)
- **File:** `docker-compose.yml`
- **Issue:** No `deploy.resources.limits` on any service.
- **Fix:** Add memory and CPU limits matching Helm chart defaults.

#### 29.6 Add missing ClickHouse env vars to env.example (Arch-M-1)
- **File:** `env.example`
- **Issue:** `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` not documented.
- **Fix:** Add to env.example with dev defaults and production warnings.

#### 29.7 Fix shared type naming drift (Arch-M-6)
- **Files:** `dashboard/src/types/api.ts`, `control-plane/src/modules/evidence/model.ts`
- **Issue:** Dashboard `EvidenceBundle` vs control-plane `EvidenceBundleRow`/`EvidenceBundleListItem`.
- **Fix:** Rename dashboard type to `EvidenceBundleListItem` or add mapping comment.

#### 29.8 Fix ClickHouse default user security (Arch-M-7)
- **File:** `docker-compose.yml:30-43`
- **Issue:** `default` user with `ACCESS_MANAGEMENT=1` and weak password.
- **Fix:** Add explicit `CLICKHOUSE_USER` config. Document as dev-only.

#### 29.9 Make CONTROL_PLANE_URL configurable (Arch-M-8)
- **File:** `docker-compose.yml:235`
- **Issue:** Hardcoded `http://control-plane:3000` without env override pattern.
- **Fix:** Change to `${CONTROL_PLANE_URL:-http://control-plane:3000}`.

#### 29.10 Add PolicyAction enum to proto (Arch-L-7)
- **File:** `proto/interdict/evidence/v1/evidence.proto`
- **Issue:** `policy_action` is bare `string`. Rust uses literals, TypeScript uses union type. No proto enforcement.
- **Fix:** Add `enum PolicyAction { ALLOW = 0; BLOCK = 1; REDACT = 2; ESCALATE = 3; }`. Update Rust and TypeScript to use it.

### Exit Criteria
- All services have healthchecks in both docker-compose and Dockerfiles.
- Zero config drift between env.example, docker-compose.yml, and Helm values.yaml.
- All env vars documented in env.example.
- Proto schema enforces valid policy action values.

---

## Low/Info Findings (Tracked, Not Phased)

These are tracked but not required for v1.3 exit:

- L-1: `clone()` on EvidenceBundle in verify hot path (performance optimization)
- L-2: Chrono truncation unwrap pattern duplication
- L-3: No rate limiting on gRPC evidence stream
- L-4: Silent JSON serialization fallback in report CLI
- L-5: `expect()` on missing KMS env var (only when KMS mode selected)
- L-6: No commented-out code found (clean)
- L-7: No unsafe blocks in production (clean)
- L-8: SHA-256 compliance (clean)
- TS-L-1: Stale "Phase 11" comment in index.ts
- TS-L-2: Module-level mutable state in useSSE
- TS-L-3: Client-side search filtering (scalability)
- TS-L-4: eslint-disable without full explanation
- TS-L-5: Stats propagation during render (React pattern)
- TS-L-6: Type assertion in useSSE
- TS-L-7: `error as Error` cast pattern
- TS-L-8: Silent SSE event parse failure
- Arch-L-1: `catch (err: any)` vs `catch (err: unknown)` consistency
- Arch-L-2: 84 console.log calls (structured logger needed)
- Arch-L-3: JSON parse error swallowing in distribution/compiler (promoted to Phase 28)

---

## Verification Gates

All phases:
- `cargo fmt --all -- --check` (when Rust toolchain available)
- `cargo clippy --workspace --all-targets -- -D warnings` (when Rust toolchain available)
- `tsc --noEmit` (control-plane)
- `bun test` (control-plane)
- `eslint` (dashboard)
- `next build` (dashboard)
- `vitest` (dashboard)

---
*Roadmap created: 2026-03-10*
*Derived from: full-codebase scan (Rust + TypeScript + Architecture)*
