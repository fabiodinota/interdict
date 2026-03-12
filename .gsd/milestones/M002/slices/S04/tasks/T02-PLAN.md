# T02: 10-saml-sso-security-hardening 02

**Slice:** S04 — **Milestone:** M002

## Description

Enable mutual TLS (mTLS) on all internal gRPC channels between kernel, control plane, and evidence collector.

Purpose: IDENT-05 requires all internal communication to be encrypted and mutually authenticated. Currently all gRPC channels use insecure/plaintext connections.
Output: mTLS-enabled gRPC servers and clients, internal CA generation script, Docker Compose cert bootstrap.

## Must-Haves

- [ ] "Evidence collector gRPC server requires valid client certificates -- connections without certs are rejected"
- [ ] "Control plane gRPC distribution server requires valid client certificates"
- [ ] "Kernel gRPC clients present client certificates when connecting to evidence collector and distribution server"
- [ ] "All mTLS certificates are signed by a shared internal CA generated at deployment time"
- [ ] "Docker Compose stack boots with mTLS enabled for all gRPC channels"

## Files

- `crates/evidence-collector/src/main.rs`
- `crates/evidence-collector/src/config.rs`
- `crates/kernel/src/evidence/client.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `crates/kernel/src/config.rs`
- `control-plane/src/modules/distribution/server.ts`
- `docker/certs/generate-internal-ca.sh`
- `docker-compose.yml`
- `docker/kernel/entrypoint.sh`
- `env.example`
