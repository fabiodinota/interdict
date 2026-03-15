---
id: T03
parent: S08
milestone: M007
provides:
  - REST API reference covering all 13 control-plane modules (53 endpoints)
  - gRPC API reference covering EvidenceCollectorService and PolicyDistributionService
key_files:
  - docs/api/rest.md
  - docs/api/grpc.md
key_decisions:
  - Manual API docs over runtime OpenAPI generation (avoids Elysia version compatibility risk)
  - Organized REST doc by module with per-module auth requirements, not flat endpoint list
patterns_established:
  - API doc structure: ToC → Auth → Envelope → Pagination → Errors → Roles → per-module sections with tables + schema examples
  - gRPC doc structure: per-service sections with RPC tables, message field tables, connection details, proto file tree
observability_surfaces:
  - none (static documentation)
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: API documentation (REST + gRPC)

**Created 692-line REST API reference and 273-line gRPC API reference covering all 13 modules (53 endpoints) and both proto services with full message schemas**

## What Happened

Read all 13 `control-plane/src/modules/*/index.ts` route files, both proto files, the auth middleware, permissions model, config, and shared utilities to catalog the complete API surface. Created `docs/api/rest.md` organized by module with:

- Authentication section documenting dual-mode auth (API key `ik_live_` prefix vs session tokens) and listing all unauthenticated endpoints
- Response envelope documentation (success, paginated, error shapes) extracted from `shared/utilities.ts`
- Cursor-based pagination pattern with defaults (50) and max (200)
- Error response table mapping HTTP status codes to machine-readable error codes
- Role hierarchy table (5 roles, levels 1–5) from `auth/permissions.ts`
- Per-module sections (all 13) with endpoint tables (Method | Path | Description | Auth Required) and key request/response schemas

Created `docs/api/grpc.md` documenting:
- EvidenceCollectorService: `SubmitEvidence` client-streaming RPC with all 3 message types (request, response, bundle with 22 fields)
- PolicyDistributionService: `Subscribe` server-stream + `Acknowledge` unary with 7 message types including enums
- Connection details table with ports, env vars, transport info
- TLS configuration notes, max message sizes, proto file tree, and grpcurl examples

Both docs cross-reference each other and the operator/troubleshooting guides. The operator guide already had cross-reference links to the API docs (added in T02).

## Verification

All task-level checks pass:
- `test -f docs/api/rest.md && test -f docs/api/grpc.md` — PASS
- `wc -l docs/api/rest.md` = 692 lines (≥ 150 required) — PASS
- `grep -c "POST\|GET\|PUT\|PATCH\|DELETE" docs/api/rest.md` = 92 (≥ 30 required) — PASS
- `grep "EvidenceCollectorService" docs/api/grpc.md` — 4 matches — PASS
- `grep "PolicyDistributionService" docs/api/grpc.md` — 5 matches — PASS
- All 13 modules confirmed present in REST doc

Slice-level checks (8/10 passing — 2 remaining are T04 tasks):
1. ✅ Operator guide ≥ 200 lines (578)
2. ✅ Troubleshooting guide ≥ 100 lines (417)
3. ✅ API docs exist
4. ✅ Dashboard vitest — (T01)
5. ✅ aria-label in TimeRangeSelector, ModelList, Sidebar — (T01)
6. ✅ axe in Playwright smoke test — (T01)
7. ❌ v1.5 in PROJECT.md — T04
8. ❌ docs/operator in README.md — T04

## Diagnostics

Static documentation — inspect with:
- `wc -l docs/api/rest.md docs/api/grpc.md` — line counts
- `grep -c "POST\|GET\|PUT\|PATCH\|DELETE" docs/api/rest.md` — HTTP method coverage
- `grep "EvidenceCollectorService\|PolicyDistributionService" docs/api/grpc.md` — gRPC service coverage
- Cross-reference endpoint counts against `control-plane/src/modules/*/index.ts` route files

## Deviations

- Added observability impact section to T03-PLAN.md per pre-flight requirement (was missing)

## Known Issues

None.

## Files Created/Modified

- `docs/api/rest.md` — 692-line REST API reference covering all 13 modules with auth, envelope, pagination, and error documentation
- `docs/api/grpc.md` — 273-line gRPC API reference covering both proto services with full message schemas and connection details
- `.gsd/milestones/M007/slices/S08/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M007/slices/S08/S08-PLAN.md` — marked T03 as done
