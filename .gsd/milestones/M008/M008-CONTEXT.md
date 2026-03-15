# M008: Assessment Remediation (v1.6)

**Gathered:** 2026-03-15
**Status:** Ready for planning

## Project Description

Interdict.io is a kernel-level AI governance and compliance platform. v1.5 achieved Production Readiness across test coverage, CI/CD, security, DevOps, and documentation. A deep foundation assessment on 2026-03-15 identified 28 findings (6 high, 10 medium, 12 low) — all refinements, not structural problems. This milestone closes every finding to bring the codebase to A-grade across all assessment dimensions before scaling beyond the two-partner pilot.

## Why This Milestone

The v1.5 deep assessment confirmed the foundation is strong (A/A- on architecture, Rust quality, and security posture), but identified specific gaps that become real risks at scale:

- **Supply chain:** CI/CD actions pinned to mutable branches (`@main`) including cosign-installer with `id-token: write`
- **Auth hardening:** No rate limiting, no session cleanup, untested SAML handlers (7KB of security-critical code)
- **Input validation:** CSV formula injection, missing body size limits, unbounded TypeBox string fields
- **Infrastructure:** No Docker Compose network segmentation, Grafana default credentials, cert-init running as root
- **Testing gaps:** Zero SAML tests, zero route handler tests, zero cross-service integration tests

These gaps are manageable at pilot scale (2 customers, internal deployment) but would become liabilities with external-facing deployments, compliance audits, or team scaling.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Deploy with confidence that all CI/CD actions are pinned to immutable SHA digests — no supply chain risk from mutable tag/branch references
- Run auth endpoints knowing rate limiting prevents brute-force attacks against API keys and SAML handoff codes
- Operate long-running deployments without session/handoff table bloat (automatic cleanup)
- Generate CSV compliance reports that are safe to open in Excel (no formula injection)
- Deploy Docker Compose with network segmentation isolating databases from the dashboard
- Verify all SAML auth flows are tested (signature verification, assertion replay, JIT provisioning)
- Run cross-service integration tests that validate real kernel→control-plane→evidence-collector flows

### Entry point / environment

- Entry point: `cargo test --workspace`, `bun test`, CI pipeline, `docker compose up`, Helm chart
- Environment: local dev (Windows + WSL), CI (GitHub Actions), Docker, Kubernetes
- Live dependencies involved: GitHub Actions (CI/CD), ghcr.io (images), Docker (integration tests)

## Completion Class

- Contract complete means: all finding fixes verified by tests, lint checks, or structural grep; CI pipeline passes with SHA-pinned actions
- Integration complete means: Docker Compose deploys with network segmentation; cross-service integration test passes; SAML test suite exercises real samlify library
- Operational complete means: session cleanup runs on interval; cert-init has security context; monitoring uses parameterized credentials

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `grep -c "@main" .github/workflows/*.yml` returns 0 — no mutable branch references in CI
- Rate limiting returns 429 after threshold on auth endpoints (test proves this)
- Expired session cleanup deletes old rows (test proves this)
- SAML auth handlers have ≥80% test coverage (test file count ≥ 3 with ≥ 20 test cases)
- CSV generator sanitizes formula-injection prefixes (test proves this)
- Docker Compose `docker compose config` shows separate networks for frontend/backend/data
- All assessment findings are addressed — final_assessment.md can be regenerated with zero high/medium findings

## Risks and Unknowns

- SAML test complexity — samlify's internal APIs may be difficult to mock without a real IdP
- Rate limiter storage — in-memory counters reset on restart; Redis adds a dependency
- Docker Compose network changes — existing deployments may need migration guidance
- Cross-service integration tests — timing sensitivity with real gRPC connections

## Existing Codebase / Prior Art

- `.github/workflows/ci-quality-security.yml` — CI pipeline with 38 action references to pin
- `.github/workflows/release.yml` — Release pipeline with cosign-installer@main
- `control-plane/src/modules/auth/` — Auth module with rate limiting gaps, SAML handlers, session service
- `control-plane/src/modules/reports/csv-generator.ts` — CSV escaping without formula sanitization
- `docker-compose.yml` — Single-network compose with 9 services
- `docker-compose.monitoring.yml` — Grafana with hardcoded credentials
- `helm/interdict/templates/cert-init-job.yaml` — No securityContext
- `helm/interdict/templates/sidecar/_sidecar-container.tpl` — Writable rootfs
- `dashboard/src/lib/auth.ts` — Cookie secure flag tied to NODE_ENV
- `dashboard/src/lib/auth-client.ts` — Dead code in client-side logout
- `dashboard/src/components/layout/RouteError.tsx` — Console.error leaks stack traces
- `crates/interdict-verify/src/main.rs` — Single production unwrap
- `proto/interdict/evidence/v1/evidence.proto` — Missing validation annotations
- `docker/kernel/entrypoint.sh` — 10-year CA validity
- `deny.toml` — Windows target in scan config

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- AR-SUPPLY-01 — All GitHub Actions pinned to SHA digests in CI and release workflows
- AR-AUTH-01 — Rate limiting on auth endpoints prevents brute-force
- AR-AUTH-02 — SAML auth handlers have comprehensive test coverage
- AR-AUTH-03 — Expired sessions and handoff codes are cleaned up automatically
- AR-INPUT-01 — CSV formula injection sanitized; TypeBox schemas have maxLength; body size limits configured
- AR-INFRA-01 — Docker Compose network segmentation; Grafana parameterized credentials; infrastructure resource limits
- AR-HELM-01 — Cert-init securityContext; sidecar read-only rootfs; ServiceAccount creation
- AR-CODE-01 — Dead code removed; console.error sanitized; cookie secure flag decoupled from NODE_ENV
- AR-PROTO-01 — Proto validation annotations; evidence field safety; CA validity reduced
- AR-TEST-01 — Cross-service integration tests validate real service boundaries

## Scope

### In Scope

- Fix all 28 assessment findings (6 high, 10 medium, 12 low)
- Write tests for all fixes
- Update operator documentation where fixes change behavior
- Update DECISIONS.md with new architectural decisions

### Out of Scope / Non-Goals

- New product features or capabilities
- Architecture changes beyond what findings require
- Performance optimization
- Horizontal scaling infrastructure (PgBouncer, circuit breakers)
- E2E user flow tests beyond integration smoke tests

## Technical Constraints

- Rust edition 2024, MSRV supporting std::sync::LazyLock
- Must not break existing 800+ test suite
- Docker Compose changes must include migration guidance for existing deployments
- SAML tests must work without a real IdP (mock/fixture-based)
- Rate limiter must be in-memory (no Redis dependency for pilot scale)

## Integration Points

- GitHub Actions CI — SHA-pinned actions, rate limiting tests in CI
- Docker Compose — network segmentation, parameterized monitoring credentials
- Helm chart — cert-init securityContext, sidecar rootfs, ServiceAccount
- samlify library — test fixture generation for SAML response validation
- Elysia middleware — rate limiting plugin integration
