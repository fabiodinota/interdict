---
phase: 10-saml-sso-security-hardening
verified: 2026-03-03T19:30:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 10: SAML SSO and Security Hardening Verification Report

**Phase Goal:** Enterprise users can authenticate via their corporate identity provider, and all internal communication is mutually authenticated and encrypted
**Verified:** 2026-03-03T19:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User can initiate SAML SSO login from the dashboard and be redirected to IdP | VERIFIED | `login/page.tsx` conditionally renders SSO button calling `window.location.href = getSsoUrl()` which resolves to `{API_URL}/api/v1/auth/saml/sso`; handler in `saml/handlers.ts` calls `sp.createLoginRequest(idp, "redirect")` and returns 302 |
| 2  | After IdP authentication, user is redirected back to ACS endpoint and a session is created | VERIFIED | `handlers.ts` POST `/acs` parses SAML response, calls `findOrCreateSamlUser`, calls `createSession`, sets httpOnly cookie, redirects to `DASHBOARD_URL` |
| 3  | SAML-authenticated user can access all dashboard views using session token in httpOnly cookie | VERIFIED | `middleware.ts` dual-mode auth: non-`ik_live_*` tokens route to `authenticateBySessionToken`; `service.ts` queries sessions table with expiry check and joins users table |
| 4  | Auth middleware accepts both API key tokens (ik_live_*) and opaque session tokens | VERIFIED | `middleware.ts` lines 66-72: prefix check `token.startsWith(API_KEY_PREFIX)` gates API key vs session token flows |
| 5  | First-time SAML user is auto-provisioned via JIT with correct role mapping | VERIFIED | `service.ts` `findOrCreateSamlUser`: validates roleHint against `VALID_ROLES` array, defaults to `read_only_auditor`, inserts new user with `isActive: true, isService: false` |
| 6  | Evidence collector gRPC server requires valid client certificates — connections without certs are rejected | VERIFIED | `evidence-collector/main.rs` lines 128-160: when `cfg.mtls_enabled`, builds `ServerTlsConfig::new().identity(...).client_ca_root(...)`, uses `Server::builder().tls_config(tls_config)` |
| 7  | Control plane gRPC distribution server requires valid client certificates | VERIFIED | `distribution/server.ts` lines 280-308: `MTLS_ENABLED=true` branches to `grpc.ServerCredentials.createSsl(caCert, [...], true)` with `checkClientCertificate=true` |
| 8  | Kernel gRPC clients present client certificates when connecting to evidence collector and distribution server | VERIFIED | `evidence/client.rs`: `ClientTlsConfig::new().ca_certificate(...).identity(...).domain_name("evidence-collector")`; `distribution/client.rs`: same pattern with `domain_name("control-plane")` |
| 9  | All mTLS certificates are signed by a shared internal CA generated at deployment time | VERIFIED | `generate-internal-ca.sh` creates CA with ECDSA P-256, signs evidence-collector, control-plane, and kernel-client certs against the same CA |
| 10 | Docker Compose stack boots with mTLS enabled for all gRPC channels | VERIFIED | `docker-compose.yml`: `cert-init` service runs script, `certs` named volume mounted read-only to control-plane, evidence-collector, and kernel; all three have `depends_on: cert-init: condition: service_completed_successfully` |
| 11 | Admin can trigger key rotation via API and a new Ed25519 key becomes the active signing key | VERIFIED | `signing-keys/index.ts` POST `/rotate` calls `rotateKey(outputPath)`; `service.ts` `rotateKey` generates Ed25519 keypair, retires existing active keys in a transaction, inserts new key as active |
| 12 | Evidence bundles signed with the old key can still be verified after rotation | VERIFIED | `signing-keys/service.ts` `getAllPublicKeys()` returns all keys (active and retired) as `Record<keyId, publicKeyHex>`; retired keys remain in `signing_keys` table with `retiredAt` set but never deleted |
| 13 | Evidence collector can hot-reload the active signing key without restart | VERIFIED | `rotation.rs` `RotatingSigningProvider` uses `ArcSwap` for lock-free atomic swaps; `main.rs` spawns `signing_key_watch_task` polling every 30s when `SIGNING_KEY_WATCH_PATH` is set; calls `provider.reload_from_file(path)` on mtime change |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Provided By | Status | Details |
|----------|-------------|--------|---------|
| `control-plane/src/modules/auth/saml/config.ts` | SAML SP and IdP configuration | VERIFIED | `samlEnabled`, `sp`, `idp` exports; graceful degradation when cert files absent; `clockDrifts: [-300, 300]`; private keys file-mounted only |
| `control-plane/src/modules/auth/saml/handlers.ts` | SSO redirect, ACS POST, SLO, metadata endpoints | VERIFIED | All four routes implemented: `/sso`, `/acs`, `/slo`, `/metadata`; ACS performs JIT provision + session creation + httpOnly cookie |
| `control-plane/src/modules/auth/middleware.ts` | Dual-mode auth: API key + session token | VERIFIED | Prefix-based dispatch; both auth paths wired to `authService`; 401 on both failure modes |
| `control-plane/src/db/schema/auth.ts` | sessions and signing_keys tables | VERIFIED | `sessions` table: uuid PK, token varchar(128) unique, userId FK, expiresAt, createdAt, indexed on token; `signingKeys` table: keyId, publicKeyHex, isActive, activatedAt, retiredAt, indexed on isActive |
| `docker/certs/generate-internal-ca.sh` | Internal CA and service certificate generation | VERIFIED | Generates CA + 3 service cert pairs (evidence-collector, control-plane, kernel-client); idempotent; ECDSA P-256; 10yr CA / 1yr service certs |
| `crates/evidence-collector/src/main.rs` | tonic Server with ServerTlsConfig requiring client certs | VERIFIED | `ServerTlsConfig`, `Identity`, `Certificate` imports used; `client_ca_root` applied; insecure fallback when `MTLS_ENABLED=false` |
| `control-plane/src/modules/distribution/server.ts` | grpc-js ServerCredentials.createSsl with checkClientCertificate=true | VERIFIED | `createSsl(caCert, [{cert_chain, private_key}], true)` on line 298-302; `readFileSync` from `node:fs` used |
| `crates/kernel/src/evidence/client.rs` | tonic Channel with ClientTlsConfig including client identity | VERIFIED | `with_mtls` constructor stores raw PEM bytes; `build_tls_config` rebuilds per connection; `domain_name("evidence-collector")` |
| `crates/kernel/src/policy/distribution/client.rs` | tonic Channel with ClientTlsConfig including client identity | VERIFIED | Same pattern; `with_mtls` builder; `build_tls_config`; `domain_name("control-plane")` |
| `crates/evidence-collector/src/signing/rotation.rs` | RotatingSigningProvider with atomic key swap | VERIFIED | `ArcSwap<Box<dyn SigningProvider>>` for lock-free swap; `BoxedProviderAdapter` for trait delegation; unit tests: sign-rotate-sign-verify cycle, cross-key failure |
| `control-plane/src/modules/signing-keys/service.ts` | Key generation, storage, rotation logic | VERIFIED | `rotateKey` generates Ed25519 keypair, extracts raw 32-byte key, computes SHA-256 key_id, transactionally retires and inserts; private key written to shared volume only |
| `control-plane/src/modules/signing-keys/index.ts` | Admin API endpoints with role-based auth guards | VERIFIED | GET `/`, POST `/rotate`, GET `/active`, GET `/public-keys`; role guards: `super_admin`, `super_admin`, `policy_admin`, `read_only_auditor` respectively |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dashboard/src/app/login/page.tsx` | `/api/v1/auth/saml/sso` | SSO button calls `window.location.href = getSsoUrl()` | WIRED | `handleSsoLogin()` at line 40-42; `getSsoUrl()` in `auth-client.ts` returns `{NEXT_PUBLIC_API_URL}/api/v1/auth/saml/sso` |
| `control-plane/src/modules/auth/saml/handlers.ts` | `control-plane/src/modules/auth/service.ts` | ACS handler calls JIT user provisioning and session creation | WIRED | `authService.findOrCreateSamlUser(...)` and `authService.createSession(user.id)` both called in ACS POST handler |
| `control-plane/src/modules/auth/middleware.ts` | `control-plane/src/db/schema/auth.ts` | Session token lookup in sessions table | WIRED | `service.ts` imports `sessions` from schema; `authenticateBySessionToken` queries `sessions` with `eq(sessions.token, token)` and expiry check |
| `docker/certs/generate-internal-ca.sh` | `docker-compose.yml` | cert-init service generates certs to shared volume; all services mount /certs | WIRED | `cert-init` service in compose mounts script and `certs` volume; control-plane, evidence-collector, kernel all mount `certs:/certs:ro` |
| `crates/kernel/src/evidence/client.rs` | `crates/evidence-collector/src/main.rs` | Kernel presents client cert, collector validates against internal CA | WIRED | Both use same internal CA; collector has `client_ca_root`; kernel client has `identity` from kernel-client cert |
| `crates/kernel/src/policy/distribution/client.rs` | `control-plane/src/modules/distribution/server.ts` | Kernel presents client cert, control plane validates against internal CA | WIRED | Same CA trust chain; distribution server has `checkClientCertificate=true`; kernel distribution client has client identity |
| `control-plane/src/modules/signing-keys/index.ts` | `control-plane/src/db/schema/auth.ts` | Admin API writes new key to signing_keys table | WIRED | `service.ts` imports `signingKeys` from schema; `rotateKey` performs `tx.insert(signingKeys).values(...)` |
| `crates/evidence-collector/src/signing/rotation.rs` | `crates/evidence-collector/src/signing/mod.rs` | RotatingSigningProvider re-exported from signing module | WIRED | `mod.rs` has `pub mod rotation` and `pub use rotation::RotatingSigningProvider`; `main.rs` imports and wraps inner provider |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IDENT-01 | 10-01-PLAN.md | User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) | SATISFIED | Full SAML SP implemented with samlify 2.10.2 (CVE-2025-47949 safe); SSO initiation, ACS, SLO, metadata endpoints; JIT provisioning; dashboard login button; dual-mode auth middleware |
| IDENT-05 | 10-02-PLAN.md | All internal component communication is encrypted and mutually authenticated via mTLS | SATISFIED | mTLS on all three gRPC channels (kernel-evidence, kernel-distribution, kernel-controlplane); internal CA bootstrap via cert-init Docker Compose service; ServerTlsConfig with client_ca_root on servers; ClientTlsConfig with client identity on clients |
| IDENT-06 | 10-03-PLAN.md | Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles | SATISFIED | Admin API at POST /api/v1/admin/signing-keys/rotate; signing_keys table persists all historical public keys; RotatingSigningProvider with ArcSwap for hot-reload; interdict-verify unchanged (already supports multi-key HashMap) |

No orphaned requirements found — REQUIREMENTS.md maps IDENT-01, IDENT-05, IDENT-06 to Phase 10 and all three are covered by plans.

---

### Anti-Patterns Found

No anti-patterns found. Scan of all phase-10 modified files found:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER comments
- No stub return patterns (`return null`, `return {}`, `return []`) in implementation code
- No console.log-only handler implementations
- No plaintext private key exposure (private keys are file-mounted or written to shared volume path only, matching CLAUDE.md Invariant 6)

---

### Human Verification Required

The following items require a live environment to verify:

#### 1. SAML Authentication End-to-End Flow

**Test:** Configure a SAML IdP (Okta dev tenant or Azure AD), set SAML_SP_KEY_PATH, SAML_SP_CERT_PATH, SAML_IDP_METADATA_PATH, and NEXT_PUBLIC_SAML_ENABLED=true. Navigate to dashboard /login and click "Sign in with SSO."
**Expected:** Browser redirects to IdP login page. After authenticating, browser returns to dashboard and user is logged in with session cookie set. A row appears in the sessions table.
**Why human:** Requires a live SAML IdP. The ACS assertion parsing (XML signature verification, attribute extraction) cannot be verified against real IdP assertions without runtime integration.

#### 2. mTLS Mutual Authentication Rejection

**Test:** Run `docker compose up`. Attempt to connect to the evidence-collector gRPC port without presenting a client certificate (e.g., via grpcurl without --cert/--key flags).
**Expected:** Connection is rejected with a TLS handshake error; connection with the kernel-client cert succeeds.
**Why human:** Requires Docker Compose environment with MTLS_ENABLED=true and generated certs. Cannot verify rejection behavior from grep alone.

#### 3. Signing Key Hot-Reload

**Test:** Set SIGNING_KEY_WATCH_PATH to a key file path. Start the evidence collector. Overwrite the key file with a newly generated key. Within 30 seconds, observe that the evidence collector logs "signing key hot-reloaded successfully" and new evidence bundles are signed with the new key_id.
**Expected:** No restart required; in-flight requests continue uninterrupted; new key_id appears in evidence bundles after reload.
**Why human:** Requires running evidence-collector process with file watcher active and 30-second polling cycle.

---

### Gaps Summary

No gaps found. All 13 observable truths are verified by substantive, wired artifacts. All three requirement IDs (IDENT-01, IDENT-05, IDENT-06) are fully satisfied.

Key architectural decisions that were verified against the codebase (not just summaries):
- samlify pinned to 2.10.2 (CVE-2025-47949 requires >= 2.10.0)
- SAML private keys are file-mounted exclusively (CLAUDE.md Invariant 6 upheld)
- mTLS has insecure fallback gated by `MTLS_ENABLED` env var (backward-compatible local dev)
- `RotatingSigningProvider` correctly uses `ArcSwap` not `RwLock` (avoids lifetime unsoundness with `&[u8]`/`&str` trait methods)
- Control-plane Task 1 signing-keys artifacts were committed in `bccd17c` alongside the mTLS commit — all code verified present regardless of which commit carried them

---

_Verified: 2026-03-03T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
