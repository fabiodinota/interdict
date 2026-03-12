# S04: Saml Sso Security Hardening

**Goal:** Implement SAML 2.
**Demo:** Implement SAML 2.

## Must-Haves


## Tasks

- [x] **T01: 10-saml-sso-security-hardening 01**
  - Implement SAML 2.0 SSO authentication for enterprise IdPs (Okta, Azure AD) with JIT user provisioning.

Purpose: Bank pilot requires SAML SSO -- users authenticate via corporate IdP instead of API keys. This is the IDENT-01 requirement.
Output: Working SAML SP in control plane, dual-mode auth middleware (API key + session), SSO login flow on dashboard.
- [x] **T02: 10-saml-sso-security-hardening 02**
  - Enable mutual TLS (mTLS) on all internal gRPC channels between kernel, control plane, and evidence collector.

Purpose: IDENT-05 requires all internal communication to be encrypted and mutually authenticated. Currently all gRPC channels use insecure/plaintext connections.
Output: mTLS-enabled gRPC servers and clients, internal CA generation script, Docker Compose cert bootstrap.
- [x] **T03: 10-saml-sso-security-hardening 03**
  - Implement Ed25519 signing key rotation for the evidence collector with admin API and hot-reload support.

Purpose: IDENT-06 requires admins to rotate signing keys without breaking verification of previously signed evidence. The existing interdict-verify already supports multi-key verification via HashMap lookup, so the main work is: (1) key registry in PostgreSQL, (2) admin rotation API, (3) hot-swappable signing provider in the evidence collector.
Output: Signing key admin API, key registry table, RotatingSigningProvider, hot-reload mechanism.

## Files Likely Touched

- `control-plane/src/modules/auth/saml/config.ts`
- `control-plane/src/modules/auth/saml/handlers.ts`
- `control-plane/src/modules/auth/saml/metadata.ts`
- `control-plane/src/modules/auth/middleware.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/package.json`
- `dashboard/src/app/login/page.tsx`
- `dashboard/src/app/api/proxy/[...path]/route.ts`
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
- `crates/evidence-collector/src/signing/mod.rs`
- `crates/evidence-collector/src/signing/rotation.rs`
- `crates/evidence-collector/src/main.rs`
- `crates/evidence-collector/src/config.rs`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/modules/signing-keys/index.ts`
- `control-plane/src/modules/signing-keys/service.ts`
- `control-plane/src/index.ts`
