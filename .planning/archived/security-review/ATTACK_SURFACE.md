# Interdict Security Review - Attack Surface and Trust Boundaries

Date: 2026-03-06
Review mode: Baseline + critical-flow deep checks, diff slice `v1.1..HEAD`

## Scope Summary
- Baseline inventory reviewed across `786` tracked files (`git ls-files`).
- Diff inventory reviewed across `309` changed files (`git diff --name-only v1.1..HEAD`).
- Executable/config/runtime-relevant diff files reviewed in `control-plane/`, `dashboard/`, `crates/`, `docker/`: `35`.
- `.github/workflows/` and `helm/` were included in baseline review; no changed files from these roots in `v1.1..HEAD`.

## Entry Points
| Surface | Component | Paths/Interfaces | Authn/Authz | Notes |
| --- | --- | --- | --- | --- |
| HTTP REST | control-plane | `/api/v1/*`, `/health` | `Authorization: Bearer` with API key or session token; role macro | Main control-plane API |
| SAML endpoints | control-plane | `/api/v1/auth/saml/sso`, `/acs`, `/slo`, `/metadata` | Unauthenticated edge of auth bootstrap | ACS issues session token |
| Dashboard BFF | dashboard | `/api/proxy/[...path]`, `/api/auth/*` | Cookie-backed session | Proxies to control-plane |
| gRPC policy distribution | control-plane | `PolicyDistribution.Subscribe/Acknowledge` on `INTERDICT_GRPC_PORT` | mTLS toggle via env | Pushes policy snapshots/deltas |
| gRPC evidence ingest | evidence-collector | `submit_evidence` | mTLS toggle via env | Accepts compressed evidence batches |
| Proxy/TLS interception | kernel | explicit proxy listener, CONNECT/TLS interception | Policy pipeline enforcement | Rust hot path |
| Background jobs | control-plane | compiler worker, review synchronization jobs | Service internal | Touches DB and ClickHouse |
| Configuration inputs | all services | env vars, mounted certs, TOML | N/A | Secrets, certs, transport mode |

## Trust Boundaries
1. Browser client -> dashboard (untrusted browser input).
2. dashboard -> control-plane (BFF boundary).
3. control-plane HTTP auth bootstrap -> SAML IdP.
4. kernel -> control-plane gRPC distribution.
5. kernel -> evidence-collector gRPC ingestion.
6. control-plane/evidence-collector -> Postgres/ClickHouse/Object store.
7. Build/deploy pipeline -> runtime containers and Helm values.

## Critical Assets
- Session tokens (`sessions.token`) and API credentials (`api_keys`).
- Signing key material and signing key registry.
- Policy modules/Wasm artifacts and distribution stream contents.
- Evidence chain fields (`chain_hash`, `previous_hash`, signatures).
- Audit/evidence data potentially containing regulated records.
- Internal CA and service cert/key material.

## Critical Data Flows
1. SAML flow: IdP assertion -> control-plane ACS -> session token -> dashboard callback -> cookie set.
2. Dashboard flow: cookie -> `/api/proxy/*` -> Bearer token to control-plane.
3. Policy distribution: kernel subscribe request -> snapshot build -> policy stream.
4. Evidence path: kernel bundle stream -> collector verify/sign/link/store.
5. Key rotation: admin route -> new key generation/activation -> file write for collector consumption.

## Diff and Ripple Focus (`v1.1..HEAD`)

### Auth/session ripple
- `control-plane/src/modules/auth/saml/handlers.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/modules/auth/middleware.ts`
- `dashboard/src/app/api/auth/saml-callback/route.ts`
- `dashboard/src/app/api/auth/login/route.ts`
- `dashboard/src/app/api/auth/logout/route.ts`

Impact focus: SAML claim trust, token transport, session lifecycle, cookie security.

### Access-control and tenant-boundary ripple
- `control-plane/src/modules/distribution/server.ts`
- `control-plane/src/modules/reports/index.ts`
- `control-plane/src/modules/evidence/index.ts`
- `control-plane/src/modules/reviews/service.ts`
- `dashboard/src/app/api/proxy/[...path]/route.ts`

Impact focus: object/function authorization, org/dept scoping, proxy misuse surface.

### Crypto/keys/evidence ripple
- `control-plane/src/modules/signing-keys/index.ts`
- `crates/evidence-collector/src/main.rs`
- `crates/evidence-collector/src/config.rs`
- `crates/evidence-collector/src/storage/clickhouse.rs`

Impact focus: key management defaults, evidence chain verification and signing behavior.

### Deployment and secrets ripple
- `docker-compose.yml`
- `env.example`
- `docker/certs/generate-internal-ca.sh`
- `crates/kernel/Cargo.toml`
- `crates/evidence-collector/Cargo.toml`
- `dashboard/package-lock.json`

Impact focus: mTLS posture, default credential exposure, dependency/supply-chain drift.

## Validation Coverage
- Static code/config review across all in-scope components.
- Runtime negative checks on compose services (`postgres`, `clickhouse`, `control-plane`, `dashboard`).
- Dependency quick triage (`bun audit`) for `control-plane` and `dashboard`.
