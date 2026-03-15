---
estimated_steps: 5
estimated_files: 2
---

# T03: API documentation (REST + gRPC)

**Slice:** S08 — Documentation, Accessibility & Polish
**Milestone:** M007

## Description

Create human-readable API reference documentation for the REST control-plane API (53 endpoints across 13 modules) and the gRPC services (2 proto service definitions). This completes the API documentation requirement of PR-OPS-01. Skip runtime OpenAPI generation (`@elysiajs/openapi`) — manual docs provide better control and avoid Elysia version compatibility risk.

## Steps

1. Read all `control-plane/src/modules/*/index.ts` route files to catalog every endpoint — method, path, request body/query/params schemas, and response shapes. Cross-reference with `model.ts` files for TypeBox schema details.
2. Create `docs/api/rest.md` organized by module. For each of the 13 modules:
   - Module name and base path prefix
   - Table of endpoints: Method | Path | Description | Auth Required
   - Request/response schema summaries for key endpoints (not full TypeBox dumps — human-readable field descriptions)
   - Authentication: document Bearer token and session cookie auth mechanisms
   - Error responses: document standard error envelope shape
   - Rate limiting or pagination patterns where applicable
3. Read both proto files (`evidence.proto`, `policy_distribution.proto`) to extract service/RPC/message definitions.
4. Create `docs/api/grpc.md` documenting:
   - EvidenceCollectorService: `SubmitEvidence` client-streaming RPC with `SubmitEvidenceRequest` and `SubmitEvidenceResponse` message schemas
   - PolicyDistributionService: `Subscribe` server-streaming RPC and `Acknowledge` unary RPC with all message schemas
   - Connection details: default ports, TLS requirements, proto file locations
   - Message field descriptions (from proto comments)
5. Add links between REST and gRPC docs, and reference from operator guide.

## Must-Haves

- [ ] REST reference covers all 13 modules with endpoint paths, methods, and descriptions
- [ ] Authentication requirements documented for each module
- [ ] gRPC reference covers both services with RPC signatures and message schemas
- [ ] Standard error response format documented
- [ ] Connection/port information documented for gRPC services

## Verification

- `test -f docs/api/rest.md && test -f docs/api/grpc.md`
- `wc -l docs/api/rest.md | awk '{exit ($1 < 150)}'` — substantive REST reference
- `grep -c "POST\|GET\|PUT\|PATCH\|DELETE" docs/api/rest.md` ≥ 30 — covers most endpoints
- `grep "EvidenceCollectorService" docs/api/grpc.md` — evidence service documented
- `grep "PolicyDistributionService" docs/api/grpc.md` — policy service documented

## Inputs

- `control-plane/src/modules/*/index.ts` — 13 route definition files with typed endpoints
- `control-plane/src/modules/*/model.ts` — 11 TypeBox schema files
- `proto/interdict/evidence/v1/evidence.proto` — EvidenceCollectorService + messages
- `proto/interdict/policy/v1/policy_distribution.proto` — PolicyDistributionService + messages
- S08 Research API Surface Summary table — module/prefix/endpoint count reference

## Observability Impact

This task produces static documentation only — no runtime signals change.

- **Inspection surface:** `test -f docs/api/rest.md && test -f docs/api/grpc.md` confirms artifacts exist.
- **Content coverage:** `grep -c "POST\|GET\|PUT\|PATCH\|DELETE" docs/api/rest.md` counts HTTP method references (expect ≥30). `grep "EvidenceCollectorService\|PolicyDistributionService" docs/api/grpc.md` confirms both gRPC services are documented.
- **Failure state:** Missing files or low line counts indicate incomplete documentation. No runtime failure mode — docs are consumed by humans only.
- **Future agent inspection:** Read `docs/api/rest.md` and `docs/api/grpc.md` directly. Cross-reference endpoint counts against `control-plane/src/modules/*/index.ts` route files.

## Expected Output

- `docs/api/rest.md` — ≥150-line REST API reference covering all 13 modules
- `docs/api/grpc.md` — gRPC API reference covering both proto services with message schemas
