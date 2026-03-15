# M008: Assessment Remediation (v1.6)

**Vision:** Close every finding from the v1.5 deep assessment — hardening CI supply chain, auth security, input validation, infrastructure isolation, Helm security, code quality, proto safety, and cross-service test coverage to achieve zero remaining high/medium findings.

## Success Criteria

- Zero GitHub Actions references using `@main` or mutable tags — all pinned to SHA digests
- Auth endpoints return 429 after configurable threshold (default: 10 requests/minute per IP)
- SAML auth handlers have ≥20 test cases covering SSO initiation, ACS processing, handoff lifecycle, JIT provisioning, SLO, metadata, and error paths
- Expired sessions and handoff codes are automatically cleaned up on a configurable interval
- OPA binary in control-plane Dockerfile is verified by SHA256 checksum
- CSV generator sanitizes formula-injection prefixes (`=`, `+`, `-`, `@`)
- Docker Compose uses 3 isolated networks (frontend, backend, data)
- Grafana monitoring credentials are parameterized via environment variables
- Helm cert-init Job has full securityContext matching other pods
- Sidecar template enforces `readOnlyRootFilesystem: true`
- All TypeBox string fields in API models have explicit `maxLength` constraints
- Elysia body size limit is configured (default: 1MB)
- Cookie `secure` flag is independently configurable via `COOKIE_SECURE` env var
- Dead code in `auth-client.ts` removed; `RouteError.tsx` console.error sanitized
- Cross-service integration test validates kernel↔control-plane policy distribution
- All 28 assessment findings have corresponding fixes with tests or structural verification

## Key Risks / Unknowns

- SAML test fixture complexity — generating valid signed SAML responses for test assertions
- Rate limiter memory footprint — unbounded IP tracking could be a DoS vector itself
- Docker Compose network migration — existing deployments need clear upgrade path
- Cross-service integration test stability — real gRPC connections may be timing-sensitive

## Proof Strategy

- SAML fixture complexity → retire in S02 by proving SAML test suite passes with mocked samlify responses
- Rate limiter memory → retire in S02 by proving IP entries are bounded with TTL-based eviction
- Compose network migration → retire in S04 by proving `docker compose up` works with new network config
- Integration test stability → retire in S06 by proving integration test passes 3 consecutive runs

## Verification Classes

- Contract verification: `cargo test --workspace --all-targets`, `bun test`, `npx vitest run`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --all -- --check`
- Integration verification: `docker compose config` validates network structure, cross-service integration test, SAML test suite
- Operational verification: session cleanup interval execution, cert-init security context in `helm template` output
- UAT / human verification: none required

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 8 slices are complete with passing verification
- `grep -c "@main" .github/workflows/*.yml` returns 0
- Rate limiting test proves 429 after threshold
- SAML test file exists with ≥20 test cases
- Expired session cleanup test proves row deletion
- CSV formula test proves sanitization
- `docker compose config` shows 3 networks
- `helm template` shows cert-init securityContext
- All 28 assessment findings addressed
- `cargo test --workspace --all-targets` passes
- `bun test` passes
- `npx vitest run` passes

## Requirement Coverage

- Covers: AR-SUPPLY-01, AR-AUTH-01, AR-AUTH-02, AR-AUTH-03, AR-INPUT-01, AR-INFRA-01, AR-HELM-01, AR-CODE-01, AR-PROTO-01, AR-TEST-01
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: CI Supply Chain Hardening** `risk:high` `depends:[]`
  > After this: All GitHub Actions across CI and release workflows are pinned to SHA digests. OPA binary download in control-plane Dockerfile includes SHA256 checksum verification. Base Docker images are pinned by digest. Zero mutable `@main` or `@vN` tag references remain. `yamllint .github/workflows/*.yml` passes.

- [x] **S02: Auth Hardening — Rate Limiting, Session Cleanup, SAML Tests** `risk:high` `depends:[]`
  > After this: Auth endpoints return 429 after rate limit threshold. Expired sessions and handoff codes are automatically cleaned up. SAML auth handlers have comprehensive test coverage. `bun test` passes with ≥20 new SAML test cases + rate limiting tests + cleanup tests.

- [x] **S03: Input Validation & Output Sanitization** `risk:medium` `depends:[]`
  > After this: CSV generator sanitizes formula-injection prefixes. All TypeBox model schemas have maxLength on string fields. Elysia body size limit is configured. `bun test` passes with new CSV sanitization tests and model validation tests.

- [x] **S04: Docker Compose & Monitoring Hardening** `risk:medium` `depends:[]`
  > After this: Docker Compose uses 3 isolated networks (frontend, backend, data). Grafana credentials are parameterized. Infrastructure services have resource limits. `docker compose config` validates. Operator guide updated with network migration notes.

- [x] **S05: Helm Security Hardening** `risk:medium` `depends:[]`
  > After this: Cert-init Job has full securityContext. Sidecar template enforces read-only rootfs. ServiceAccount is created by default. Cert PVC uses ReadWriteMany for multi-node. `helm template` output validates all security contexts. `bash scripts/quality/infra-check.sh` passes.

- [x] **S06: Cross-Service Integration Tests** `risk:high` `depends:[S02]`
  > After this: Integration test validates kernel subscribing to control-plane gRPC policy distribution, receiving a policy update, and enforcing it. Evidence pipeline integration test validates kernel→evidence-collector→ClickHouse flow. Tests pass in CI via docker-compose orchestration.

- [ ] **S07: Code Quality & Dashboard Fixes** `risk:low` `depends:[]`
  > After this: Dead code removed from auth-client.ts. RouteError.tsx console.error sanitized for production. Cookie secure flag decoupled from NODE_ENV. ClickHouse password warns when empty in production. interdict-verify production unwrap replaced. `as any` removed from test code. `npx vitest run` and `cargo test` pass.

- [ ] **S08: Proto Safety, Config Hygiene & Documentation** `risk:low` `depends:[S01,S02,S03,S04,S05,S06,S07]`
  > After this: Proto files have buf validate annotations on string/bytes fields. Kernel entrypoint CA validity reduced from 10 years to 1 year. deny.toml Windows target removed. prompt_text/response_text proto fields documented with deprecation notice. Operator guide updated with all new procedures. final_assessment.md regenerated showing zero high/medium findings.

## Boundary Map

### S01 (CI Supply Chain)

Produces:
- SHA-pinned GitHub Actions references across all 3 workflow files
- OPA checksum verification in control-plane Dockerfile
- Digest-pinned base images in all 4 Dockerfiles
- Renovate config updated to track digest updates

Consumes:
- nothing (independent slice)

### S02 (Auth Hardening) → S06

Produces:
- Rate limiting middleware for Elysia routes
- Session/handoff cleanup service with interval-based execution
- SAML test fixtures and test suite
- Proven auth service patterns that integration tests in S06 can exercise

Consumes:
- nothing (independent slice)

### S03 (Input Validation)

Produces:
- CSV formula sanitization function
- TypeBox maxLength constraints on all model string fields
- Elysia body size limit configuration

Consumes:
- nothing (independent slice)

### S04 (Docker Compose)

Produces:
- 3-network Docker Compose topology (frontend, backend, data)
- Parameterized Grafana credentials
- Infrastructure resource limits
- Migration guidance in operator docs

Consumes:
- nothing (independent slice)

### S05 (Helm Security)

Produces:
- Hardened cert-init Job with securityContext
- Read-only rootfs sidecar
- ServiceAccount with RBAC
- ReadWriteMany cert PVC

Consumes:
- nothing (independent slice)

### S06 (Integration Tests)

Produces:
- Cross-service integration test infrastructure (docker-compose test profile)
- Policy distribution integration test
- Evidence pipeline integration test

Consumes:
- S02 auth patterns (rate limiter must not interfere with integration test auth)

### S07 (Code Quality)

Produces:
- Cleaned dashboard code (dead code removed, console.error sanitized)
- Configurable cookie secure flag
- interdict-verify production unwrap fix

Consumes:
- nothing (independent slice)

### S08 (Proto Safety & Documentation)

Produces:
- buf validate annotations on proto fields
- Updated operator documentation covering all M008 changes
- Regenerated final_assessment.md

Consumes:
- All prior slices (documents the final state after all changes land)
