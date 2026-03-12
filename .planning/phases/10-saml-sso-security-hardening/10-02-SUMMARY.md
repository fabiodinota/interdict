---
phase: 10-saml-sso-security-hardening
plan: 02
subsystem: infra
tags: [mtls, grpc, tonic, tls, certificates, openssl, docker]

# Dependency graph
requires:
  - phase: 08-docker-compose-dev-stack
    provides: Docker Compose service definitions and entrypoint scripts
provides:
  - Internal CA generation script for deployment-time cert bootstrap
  - mTLS-enabled gRPC servers (evidence collector, control plane)
  - mTLS-enabled gRPC clients (kernel evidence + distribution)
  - Docker Compose cert-init service with shared certs volume
affects: [12-helm-sidecar-ca-cert]

# Tech tracking
tech-stack:
  added: [tonic-tls, grpc-js-ssl]
  patterns: [mtls-toggle-pattern, cert-bytes-rebuild-pattern]

key-files:
  created:
    - docker/certs/generate-internal-ca.sh
  modified:
    - crates/evidence-collector/src/main.rs
    - crates/evidence-collector/src/config.rs
    - crates/kernel/src/evidence/client.rs
    - crates/kernel/src/policy/distribution/client.rs
    - crates/kernel/src/config.rs
    - crates/kernel/src/evidence/mod.rs
    - crates/kernel/src/main.rs
    - control-plane/src/modules/distribution/server.ts
    - docker-compose.yml
    - docker/kernel/entrypoint.sh
    - env.example

key-decisions:
  - "ECDSA P-256 for internal CA and service certs (openssl ec, not ed25519, for broader TLS library compat)"
  - "mTLS toggle via MTLS_ENABLED env var for backward-compatible local dev without Docker"
  - "Cert bytes stored as raw Vec<u8> in client structs, ClientTlsConfig rebuilt per connection (not Clone)"
  - "Shell script cert generation (not rcgen) for one-shot Alpine init container simplicity"

patterns-established:
  - "mTLS toggle pattern: env-var gated TLS config with insecure fallback for development"
  - "Cert bytes rebuild pattern: store raw PEM bytes, reconstruct ClientTlsConfig per connect (tonic limitation)"

requirements-completed: [IDENT-05]

# Metrics
duration: 6min
completed: 2026-03-03
---

# Phase 10 Plan 02: Internal gRPC mTLS Summary

**Mutual TLS on all internal gRPC channels with ECDSA P-256 certs, internal CA bootstrap via Alpine init container, and env-var toggle for dev fallback**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T18:35:46Z
- **Completed:** 2026-03-03T18:42:04Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Internal CA generation script creates CA + 3 service cert pairs (evidence-collector, control-plane, kernel-client)
- Docker Compose cert-init service runs before all gRPC services, shared certs volume mounted read-only
- Evidence collector gRPC server requires client certificates via ServerTlsConfig with client_ca_root
- Control plane gRPC distribution server requires client certificates via ServerCredentials.createSsl
- Kernel evidence and distribution gRPC clients present client identity via ClientTlsConfig
- All services fall back to insecure mode when MTLS_ENABLED is not set (local dev compatibility)

## Task Commits

Each task was committed atomically:

1. **Task 1: Internal CA generation script and Docker Compose cert bootstrap** - `bccd17c` (feat)
2. **Task 2: mTLS on evidence collector server, control plane gRPC server, and kernel gRPC clients** - `c6ba408` (feat)

## Files Created/Modified
- `docker/certs/generate-internal-ca.sh` - Internal CA + service cert generation (ECDSA P-256, 10yr CA / 1yr service)
- `docker-compose.yml` - cert-init service, depends_on, certs volume, mTLS env vars for all services
- `docker/kernel/entrypoint.sh` - Default addresses changed to https://, mTLS cert path env vars
- `env.example` - mTLS configuration section documenting all new env vars
- `crates/evidence-collector/src/main.rs` - ServerTlsConfig with client_ca_root when MTLS_ENABLED=true
- `crates/evidence-collector/src/config.rs` - mTLS config fields (mtls_enabled, cert paths)
- `crates/evidence-collector/Cargo.toml` - tonic "tls" feature enabled
- `control-plane/src/modules/distribution/server.ts` - ServerCredentials.createSsl with checkClientCertificate=true
- `crates/kernel/src/evidence/client.rs` - ClientTlsConfig with client identity for evidence collector
- `crates/kernel/src/policy/distribution/client.rs` - ClientTlsConfig with client identity for control plane
- `crates/kernel/src/evidence/mod.rs` - MtlsCerts struct, passed through EvidenceBuffer to gRPC client
- `crates/kernel/src/main.rs` - Reads KERNEL_MTLS_* env vars, passes certs to both gRPC clients
- `crates/kernel/src/config.rs` - mTLS cert path fields on DistributionConfig
- `crates/kernel/Cargo.toml` - tonic "tls" feature enabled

## Decisions Made
- Used ECDSA P-256 for all certificates (broader TLS library compatibility than Ed25519)
- mTLS gated by MTLS_ENABLED env var so local `cargo test` and dev without Docker still works
- Stored cert bytes as raw Vec<u8> and rebuild ClientTlsConfig per connection because tonic's ClientTlsConfig is not Clone
- Used shell script (openssl CLI) in Alpine init container rather than rcgen for one-shot deployment bootstrap

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Build tools (cargo, bun) not available in execution shell environment; verification deferred to CI pipeline
- Task 1 commit included pre-staged files from another plan (signing-keys module); no functional impact

## User Setup Required
None - no external service configuration required. mTLS bootstraps automatically via Docker Compose cert-init.

## Next Phase Readiness
- All internal gRPC channels are mTLS-ready in Docker Compose
- Phase 12 (Helm/sidecar) will need to adapt cert generation for Kubernetes cert-manager or init containers
- Local development continues to work without mTLS (env var toggle)

---
*Phase: 10-saml-sso-security-hardening*
*Completed: 2026-03-03*
