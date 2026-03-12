# T03: 10-saml-sso-security-hardening 03

**Slice:** S04 — **Milestone:** M002

## Description

Implement Ed25519 signing key rotation for the evidence collector with admin API and hot-reload support.

Purpose: IDENT-06 requires admins to rotate signing keys without breaking verification of previously signed evidence. The existing interdict-verify already supports multi-key verification via HashMap lookup, so the main work is: (1) key registry in PostgreSQL, (2) admin rotation API, (3) hot-swappable signing provider in the evidence collector.
Output: Signing key admin API, key registry table, RotatingSigningProvider, hot-reload mechanism.

## Must-Haves

- [ ] "Admin can trigger key rotation via API and a new Ed25519 key becomes the active signing key"
- [ ] "Evidence bundles signed with the old key can still be verified after rotation"
- [ ] "Key registry in PostgreSQL tracks active and retired keys with their public key material"
- [ ] "Evidence collector can hot-reload the active signing key without restart"
- [ ] "The verifier (interdict-verify) works without changes -- it already supports multi-key lookup via HashMap"

## Files

- `crates/evidence-collector/src/signing/mod.rs`
- `crates/evidence-collector/src/signing/rotation.rs`
- `crates/evidence-collector/src/main.rs`
- `crates/evidence-collector/src/config.rs`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/modules/signing-keys/index.ts`
- `control-plane/src/modules/signing-keys/service.ts`
- `control-plane/src/index.ts`
