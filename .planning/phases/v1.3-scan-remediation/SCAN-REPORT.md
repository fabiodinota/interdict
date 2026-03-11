# Full Codebase Scan Report — 2026-03-10

**Scope:** Rust (kernel, evidence-collector, interdict-verify), TypeScript (control-plane, dashboard), Architecture/Deployment
**Totals:** 15 High, 31 Medium, 29 Low/Info = 75 findings

---

## Rust Scan Results

**Summary:** High: 5 | Medium: 9 | Low/Info: 8

### High

1. `crates/kernel/src/main.rs:82-83,113-115,140-141` — `expect()`/`panic!()` in kernel startup for WasmEngine, ONNX, ReviewQueueStore
   -> RUST-07 (no panic in production paths)

2. `crates/evidence-collector/src/main.rs:139,143,147,150-154,163,174` — Six `expect()`/`panic!()` calls in mTLS cert loading
   -> RUST-07, SEC-01

3. `crates/kernel/src/evidence/bundle.rs:42-44` — Evidence chain fields unpopulated at kernel side; no in-transit integrity
   -> EVID-01 (chain hash tamper evidence)

4. `crates/kernel/src/policy/layer3/store.rs` — `std::sync::Mutex<rusqlite::Connection>` blocks Tokio worker
   -> RUST-12 (no blocking in async)

5. `crates/kernel/src/proxy/connect.rs:736-737` — Internal `err.to_string()` leaked to HTTP clients
   -> SEC-03 (no internal details in responses)

### Medium

1. `crates/evidence-collector/src/main.rs:209,220` — Blocking `std::fs` in async signing key watcher
2. `crates/evidence-collector/src/config.rs:41-42` — Hard-coded default URLs (localhost)
3. `crates/evidence-collector/src/storage/clickhouse.rs:64` — SQL injection risk in database name interpolation
4. `crates/evidence-collector/src/main.rs:31-37` — ClickHouse URL with potential credentials in startup log
5. `crates/evidence-collector/src/grpc/service.rs:179` — Invalid timestamps silently replaced with Utc::now()
6. `crates/evidence-collector/src/grpc/service.rs:124-128` — Rejected bundles not logged
7. `crates/evidence-collector/src/grpc/service.rs:44,124` — kernel_id not validated, unbounded HashMap growth
8. `crates/evidence-collector/src/storage/s3.rs:42-49` — S3 Object Lock failure non-fatal
9. `crates/kernel/src/proxy/relay.rs:167` — inspect_request() called on response direction (naming confusion)

### Low/Info

- L-1: clone() on EvidenceBundle in verify hot path
- L-2: Chrono truncation unwrap duplication
- L-3: No rate limiting on gRPC evidence stream
- L-4: Silent JSON serialization fallback in report CLI
- L-5: expect() on missing KMS env var
- L-6: No commented-out code (clean)
- L-7: No unsafe blocks in production (clean)
- L-8: SHA-256 compliance throughout (clean)

---

## TypeScript Scan Results

**Summary:** High: 6 | Medium: 14 | Low: 8 | Info: 5

### High

1. `control-plane/src/modules/auth/middleware.ts:44,62` — `ctx: any` and `store as any` in core auth resolution
2. `control-plane/src/modules/compiler/index.ts:15-54` — Missing auth on `GET /:id/compilation-status`
3. `control-plane/src/modules/reviews/index.ts:54-91` — Missing auth on `POST /ingest`
4. `control-plane/src/modules/evidence/service.ts:157` — ISO 8601 to ClickHouse without toChDateTime()
5. `control-plane/src/config.ts:47-48` — Hard-coded postgres credentials as fallback
6. `control-plane/src/modules/auth/service.ts:190-191` — `.catch(() => {})` on lastUsedAt update

### Medium

1. Multiple route files — `ctx: any` on 27+ route handlers across 9 modules
2. Multiple service files — `db: any` on 6 service constructors
3. `reports/service.ts` — `rows: any[]`, `(p: any)`, `(r: any)` in 10+ locations
4. `distribution/server.ts`, `distribution/tracker.ts` — proto `as any`, handler `any`, stream `any`
5. `compiler/validator.ts:74,97` — `catch (err: any)` instead of `unknown`
6. `anomalies/service.ts:71-74` — All 4 queries `.catch(() => [])` (overlaps Arch-H-13)
7. `auth/saml/config.ts:13` — `@ts-ignore` without migration plan
8. `auth/saml/config.ts:25-26` — Hard-coded SAML metadata URL
9. `dashboard/src/lib/auth-client.ts:24,38` — Hard-coded localhost URLs
10. `reports/service.ts` — ClickHouse queries missing event_date partition filter
11. `dashboard/src/app/(dashboard)/` — Zero loading.tsx/error.tsx across 13 route segments
12. `dashboard/src/hooks/use-dashboard-stats.ts:31,37` — Index signatures `[key: string]: unknown`
13. `dashboard/src/app/(dashboard)/reports/page.tsx:30` — `as` type cast
14. `audit/enrichment.ts:49-50,123,145,167` — `db: any` on enrichment functions

### Low

- L-1: Stale "Phase 11" comment in index.ts
- L-2: Module-level mutable state in useSSE
- L-3: Client-side search filtering (policies, vendors)
- L-4: eslint-disable without full explanation
- L-5: Stats propagation during render
- L-6: Type assertion in useSSE
- L-7: `error as Error` cast pattern
- L-8: Silent SSE event parse failure

### Info (Positive)

- I-1: Dashboard hooks well-structured with TanStack Query
- I-2: BFF proxy correctly implemented
- I-3: shadcn/ui components clean
- I-4: Evidence verification stepper good UX
- I-5: SAML callback validates server-side

---

## Architecture & Cross-Language Scan Results

**Summary:** High: 4 | Medium: 8 | Low: 5 | Info: 3

### High

1. `docker-compose.yml:183-241` — Missing healthchecks for kernel, evidence-collector, dashboard
2. `control-plane/src/modules/anomalies/service.ts:71-74` — All anomaly queries swallow errors (duplicate of TS-M-6)
3. `docker-compose.yml:207` + `env.example:127` — Config drift: INTERDICT_EVIDENCE_COLLECTOR_ADDR vs KERNEL_EVIDENCE_COLLECTOR_ADDR
4. `env.example:171` vs `docker-compose.yml:230` — NEXT_PUBLIC_API_URL port 3000 vs 3001 mismatch

### Medium

1. `env.example` — Missing CLICKHOUSE_USER and CLICKHOUSE_PASSWORD
2. `auth/service.ts:187-191` — Fire-and-forget lastUsedAt (duplicate of TS-H-6)
3. `reviews/service.ts:485-487` — JSON parse error swallowing
4. `docker-compose.yml` — No resource limits on any service
5. `docker/control-plane/Dockerfile:61` — Missing HEALTHCHECK instruction
6. `dashboard/src/types/api.ts` vs `control-plane/evidence/model.ts` — EvidenceBundle type naming drift
7. `docker-compose.yml:30-43` — ClickHouse default user security
8. `docker-compose.yml:235` — CONTROL_PLANE_URL hardcoded without env override

### Low/Info

- L-1: `catch (err: any)` vs `catch (err: unknown)` inconsistency
- L-2: 84 console.log calls — no structured logger
- L-3: JSON parse swallowing in distribution/compiler
- I-1: CI coverage comprehensive — all AGENTS.md gates covered
- I-2: No cross-boundary import violations — architecture clean
- L-4: Proto policy_action is bare string, not enum
- L-5: Dashboard auth-client localhost fallback (reinforces TS-M-9)

---

*Generated by full-codebase scan on 2026-03-10*
*Rules derived from CLAUDE.md + Interdict security model (2026)*
