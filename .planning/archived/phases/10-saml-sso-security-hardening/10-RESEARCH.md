# Phase 10: SAML SSO & Security Hardening - Research

**Researched:** 2026-03-03
**Domain:** Enterprise SSO (SAML 2.0), mTLS for gRPC, Ed25519 key rotation
**Confidence:** MEDIUM

## Summary

Phase 10 covers three distinct but interconnected security domains: (1) SAML 2.0 SSO integration for enterprise IdPs (Okta, Azure AD), (2) mutual TLS for all internal gRPC communication between kernel, control plane, and evidence collector, and (3) Ed25519 signing key rotation with backward-compatible verification. The existing codebase has solid foundations for all three -- the auth middleware already uses a macro-based plugin pattern, gRPC channels use tonic (Rust) and @grpc/grpc-js (TypeScript) which both support TLS natively, and the evidence signing already uses a `SigningProvider` trait with `key_id()` that maps naturally to multi-key verification.

The SAML integration is the highest-risk item due to the STATE.md research flag: "samlify on Bun runtime needs isolated PoC before implementation." A critical CVE (CVE-2025-47949, CVSS 9.9) was patched in samlify 2.10.0 -- the library MUST be pinned to >= 2.10.0. The alternative `@node-saml/node-saml` library is more battle-tested but depends on Passport.js middleware which is Express-centric and does not map cleanly to Elysia's macro pattern.

mTLS is well-supported by both tonic (via `ServerTlsConfig::client_ca_root`) and @grpc/grpc-js (via `ServerCredentials.createSsl` with client cert requirement). The main challenge is bootstrapping certificates -- generating a shared internal CA at deployment time and distributing certs to all services via Docker Compose volumes.

Key rotation leverages the existing `signing_key_id` field already stored per evidence bundle. The verifier (`interdict-verify`) already accepts a `HashMap<String, Vec<u8>>` of key_id-to-public-key mappings, so multi-key verification works today. The collector needs a config reload mechanism and the control plane needs an admin API endpoint for key management.

**Primary recommendation:** Use samlify >= 2.10.0 for SAML SP, generate internal CA certs via a shared init container, and extend the existing `SigningProvider` trait to support hot-swappable key sets.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-01 | User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) | samlify library for SP implementation; control plane SAML module with ACS endpoint; dashboard SSO login flow via redirect |
| IDENT-05 | All internal component communication encrypted and mutually authenticated via mTLS | tonic ServerTlsConfig with client_ca_root for Rust services; @grpc/grpc-js ServerCredentials.createSsl for control plane; shared internal CA via init container |
| IDENT-06 | Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles | Multi-key signing provider wrapping existing trait; key registry table in PostgreSQL; admin API for rotation; verifier already supports multi-key lookup |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| samlify | >= 2.10.0 | SAML 2.0 SP implementation | Node.js SAML library with SP/IdP support; CVE-2025-47949 patched in 2.10.0 |
| tonic (tls feature) | 0.14 | Rust gRPC with mTLS | Already in kernel and evidence-collector Cargo.toml; native rustls TLS support |
| @grpc/grpc-js | ^1.12.0 | TypeScript gRPC with mTLS | Already in control-plane package.json; ServerCredentials.createSsl supports mTLS |
| rcgen | 0.13 | Internal CA and cert generation | Already in kernel for TLS interception CA; extend for internal mTLS CA |
| ed25519-dalek | 2.2 | Ed25519 signing and verification | Already in evidence-collector and interdict-verify |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rustls | 0.23 | TLS backend for tonic | Already a dependency; provides ServerConfig with client auth |
| xml-crypto | latest | XML signature verification (samlify dep) | Transitive dependency; needed for SAML assertion validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| samlify | @node-saml/node-saml | More mature but tightly coupled to Passport.js/Express; samlify is framework-agnostic |
| samlify | passport-saml via Elysia adapter | Would require wrapping Express middleware; adds unnecessary abstraction layer |
| rcgen (cert gen) | openssl CLI in init container | rcgen is already in the project and generates certs programmatically; CLI is less reproducible |

**Installation:**
```bash
# Control plane
cd control-plane && bun add samlify@^2.10.0

# No new Rust dependencies needed -- tonic tls, rcgen, rustls already present
```

## Architecture Patterns

### Recommended Project Structure
```
control-plane/src/modules/
  auth/
    middleware.ts          # Extend: support both API key and SAML session auth
    service.ts            # Extend: SAML user provisioning (JIT)
    saml/
      config.ts           # SAML SP configuration (entity ID, ACS URL, certs)
      handlers.ts         # SSO redirect, ACS POST, SLO endpoints
      metadata.ts         # SP metadata XML generation
  distribution/
    server.ts             # Upgrade: createInsecure() -> createSsl() with mTLS
  signing-keys/
    index.ts              # Admin API for key rotation
    service.ts            # Key generation, storage, distribution

crates/evidence-collector/src/
  signing/
    mod.rs                # Extend: MultiKeySigningProvider
    local.rs              # Existing: unchanged
    rotation.rs           # New: hot-swap key provider with graceful rotation

docker/
  certs/
    generate-internal-ca.sh  # Script for internal mTLS CA generation
```

### Pattern 1: SAML SP with Elysia (Framework-Agnostic samlify)
**What:** samlify operates independently of any HTTP framework -- it takes XML strings in and produces redirect URLs / parsed assertions out. Elysia routes call samlify directly.
**When to use:** Always for this project (Elysia, not Express)
**Example:**
```typescript
// Source: samlify docs + project convention
import * as samlify from 'samlify';

const sp = samlify.ServiceProvider({
  entityID: 'https://interdict.example.com/saml/metadata',
  assertionConsumerService: [{
    Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
    Location: 'https://interdict.example.com/api/v1/auth/saml/acs',
  }],
  privateKey: readFileSync('/path/to/sp-key.pem'),
  signingCert: readFileSync('/path/to/sp-cert.pem'),
});

// In Elysia route handler (ACS POST endpoint):
const { extract } = await sp.parseLoginResponse(idp, 'post', { body: ctx.body });
// extract.nameID -> user email
// extract.attributes -> role mapping attributes
```

### Pattern 2: mTLS for tonic gRPC (Rust side)
**What:** Configure tonic Server with ServerTlsConfig requiring client certificates
**When to use:** Evidence collector gRPC server, kernel gRPC clients
**Example:**
```rust
// Source: tonic docs
use tonic::transport::{Server, Identity, Certificate, ServerTlsConfig};

let cert = tokio::fs::read("/certs/server.pem").await?;
let key = tokio::fs::read("/certs/server-key.pem").await?;
let client_ca = tokio::fs::read("/certs/internal-ca.pem").await?;

let tls = ServerTlsConfig::new()
    .identity(Identity::from_pem(cert, key))
    .client_ca_root(Certificate::from_pem(client_ca));

Server::builder()
    .tls_config(tls)?
    .add_service(EvidenceCollectorServer::new(service))
    .serve(grpc_addr)
    .await?;
```

### Pattern 3: mTLS for @grpc/grpc-js (TypeScript side)
**What:** Control plane gRPC server requires client cert via ServerCredentials.createSsl
**When to use:** Control plane distribution server
**Example:**
```typescript
// Source: @grpc/grpc-js docs
import * as grpc from '@grpc/grpc-js';
import { readFileSync } from 'node:fs';

const rootCert = readFileSync('/certs/internal-ca.pem');
const serverCert = readFileSync('/certs/server.pem');
const serverKey = readFileSync('/certs/server-key.pem');

const creds = grpc.ServerCredentials.createSsl(
  rootCert,                          // CA for validating client certs
  [{ cert_chain: serverCert, private_key: serverKey }],
  true                               // checkClientCertificate = true (mTLS)
);

server.bindAsync(bindAddress, creds, (err, port) => { ... });
```

### Pattern 4: Multi-Key Signing Provider with Graceful Rotation
**What:** Wrap the existing SigningProvider trait to support active + retired keys
**When to use:** Evidence collector key rotation
**Example:**
```rust
// Conceptual pattern -- builds on existing SigningProvider trait
pub struct RotatingSigningProvider {
    active: Arc<dyn SigningProvider>,
    // retired keys kept for reference; verification uses key registry
}

impl RotatingSigningProvider {
    pub fn rotate(&self, new_provider: Arc<dyn SigningProvider>) {
        // Atomically swap active key
        // Old key's public key remains in key registry for verification
    }
}
```

### Pattern 5: Just-In-Time (JIT) User Provisioning
**What:** When a user authenticates via SAML for the first time, automatically create a user record from IdP attributes
**When to use:** SAML SSO login flow
**Example:**
```typescript
// After SAML assertion extraction:
const email = extract.nameID;
const displayName = extract.attributes?.displayName || email;
// Lookup or create user
let user = await db.select().from(users).where(eq(users.email, email));
if (!user.length) {
  user = await db.insert(users).values({
    email,
    displayName,
    externalId: extract.nameID,  // SAML subject -- column already exists!
    role: mapIdpRoleToInterdict(extract.attributes?.role),
  }).returning();
}
```

### Anti-Patterns to Avoid
- **Storing SAML private key in env vars:** Use file-mounted secrets (Docker secrets or volume mounts). CLAUDE.md invariant 6 prohibits plaintext secrets in logs, and env vars leak into process listings.
- **Using self-signed certs without a shared CA for mTLS:** All services must share a common internal CA. Per-service self-signed certs make mutual verification impossible.
- **Single signing key without key_id tracking:** The evidence collector already stores `signing_key_id` per bundle. Never remove this field or replace it with a hardcoded value.
- **Blocking the data plane for auth operations:** SAML auth is control-plane only. The kernel does not participate in SAML flows (CLAUDE.md invariant 1: Rust-only data plane hot path).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SAML XML parsing/signing | Custom XML canonicalization | samlify >= 2.10.0 | XML canonicalization (C14N) is notoriously error-prone; signature wrapping attacks (CVE-2025-47949) demonstrate the risk |
| Internal CA certificate generation | Shell scripts with openssl CLI | rcgen (Rust) or init container with rcgen binary | Already in the project, deterministic, no external tool dependency |
| TLS certificate validation | Manual X.509 parsing | rustls (Rust) / @grpc/grpc-js built-in (TS) | Both have battle-tested certificate validation |
| SAML assertion attribute mapping | Manual XML XPath queries | samlify extract.attributes | Library handles namespace resolution and canonicalization |

**Key insight:** SAML is an XML-heavy protocol where subtle canonicalization differences cause signature verification failures. The CVE-2025-47949 in samlify (CVSS 9.9) proves that even library maintainers get this wrong -- custom implementations are virtually guaranteed to have security holes.

## Common Pitfalls

### Pitfall 1: samlify on Bun Runtime Compatibility
**What goes wrong:** samlify depends on xml-crypto which uses Node.js native crypto APIs. Bun's crypto compatibility is not 100% -- some XML canonicalization methods may fail.
**Why it happens:** Bun implements most but not all Node.js crypto APIs.
**How to avoid:** Run a PoC test before full implementation: create a minimal SAML SP, send a test assertion, verify signature verification works. STATE.md already flags this: "samlify on Bun runtime needs isolated PoC before implementation."
**Warning signs:** `TypeError: crypto.createSign is not a function` or XML signature verification failures that work in Node.js but fail in Bun.

### Pitfall 2: SAML Clock Skew
**What goes wrong:** SAML assertions have NotBefore/NotOnOrAfter timestamps. If the IdP and SP clocks differ by more than a few minutes, assertions are rejected.
**Why it happens:** Docker containers may not sync time perfectly; cloud VMs can drift.
**How to avoid:** Configure samlify with `clockDrifts: [-300, 300]` (5 minutes tolerance). In Docker Compose, containers share host clock by default.
**Warning signs:** "Assertion is not yet valid" or "Assertion has expired" errors that occur intermittently.

### Pitfall 3: mTLS Certificate Bootstrap Ordering
**What goes wrong:** Services fail to start because mTLS certs don't exist yet. The evidence collector starts before the cert-generation init container finishes.
**Why it happens:** Docker Compose depends_on only waits for health checks, not for volume contents.
**How to avoid:** Use a dedicated init container that generates all certs and writes them to shared volumes. Services that require certs must depend_on this init container with `condition: service_completed_successfully`.
**Warning signs:** TLS handshake failures on startup, "certificate not found" errors, services in restart loops.

### Pitfall 4: gRPC Channel Re-establishment After mTLS Upgrade
**What goes wrong:** Existing plaintext gRPC connections (kernel -> control-plane, kernel -> evidence-collector) stop working after enabling mTLS.
**Why it happens:** The kernel currently connects with `http://` scheme. mTLS requires `https://` and client cert configuration.
**How to avoid:** Update all `KERNEL_DISTRIBUTION_ADDR` and `KERNEL_EVIDENCE_COLLECTOR_ADDR` env vars to use `https://` scheme. Update both `Endpoint::from_shared()` calls in Rust to include `ClientTlsConfig` with identity and CA root.
**Warning signs:** `StatusCode::Unavailable` or "transport error" in kernel logs after mTLS deployment.

### Pitfall 5: Key Rotation Race Condition
**What goes wrong:** During key rotation, bundles signed with the old key are rejected because the verifier only knows the new key.
**Why it happens:** If the key registry update and signing key swap are not atomic, there's a window where bundles in flight are signed with the old key but the verifier has already switched.
**How to avoid:** The key registry MUST retain old keys. The verifier (`interdict-verify`) already uses `HashMap<String, Vec<u8>>` for multi-key lookup. The rotation flow is: (1) generate new key, (2) add new key to registry, (3) swap active signing key, (4) never remove old key from verification registry.
**Warning signs:** Signature verification failures immediately after rotation that resolve after a few seconds.

### Pitfall 6: SAML Session vs API Key Session Conflict
**What goes wrong:** The dashboard currently stores API key in httpOnly cookie. SAML SSO needs a different session mechanism (the user doesn't have an API key).
**Why it happens:** Current login flow: user pastes API key -> cookie stores API key -> BFF proxy injects Bearer token. SAML flow has no API key.
**How to avoid:** After SAML authentication, the control plane should issue a session token (JWT or opaque token) that the dashboard stores in the same httpOnly cookie. The BFF proxy and auth middleware need to accept both API keys and session tokens.
**Warning signs:** SAML login succeeds at IdP but user gets 401 on dashboard API calls.

## Code Examples

### SAML SP Configuration with samlify
```typescript
// Source: samlify docs (https://samlify.js.org/sp-configuration.html)
import * as samlify from 'samlify';

// Validator is required -- samlify ships without one for security
import * as validator from '@authenio/samlify-xsd-schema-validator';
samlify.setSchemaValidator(validator);

const sp = samlify.ServiceProvider({
  entityID: 'https://interdict.example.com/saml/metadata',
  assertionConsumerService: [{
    Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
    Location: 'https://interdict.example.com/api/v1/auth/saml/acs',
  }],
  singleLogoutService: [{
    Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
    Location: 'https://interdict.example.com/api/v1/auth/saml/slo',
  }],
  privateKey: readFileSync(process.env.SAML_SP_KEY_PATH || '/certs/saml-sp.key'),
  signingCert: readFileSync(process.env.SAML_SP_CERT_PATH || '/certs/saml-sp.crt'),
  nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
  wantAssertionsSigned: true,
});

// IdP configuration loaded from metadata XML (Okta/Azure AD provide this)
const idp = samlify.IdentityProvider({
  metadata: readFileSync(process.env.SAML_IDP_METADATA_PATH || '/config/idp-metadata.xml'),
});
```

### tonic mTLS Client Configuration (Kernel side)
```rust
// Source: tonic transport docs
use tonic::transport::{Channel, ClientTlsConfig, Certificate, Identity};

let ca_cert = tokio::fs::read("/certs/internal-ca.pem").await?;
let client_cert = tokio::fs::read("/certs/kernel-client.pem").await?;
let client_key = tokio::fs::read("/certs/kernel-client-key.pem").await?;

let tls = ClientTlsConfig::new()
    .ca_certificate(Certificate::from_pem(ca_cert))
    .identity(Identity::from_pem(client_cert, client_key))
    .domain_name("evidence-collector");  // SAN in server cert

let channel = Channel::from_static("https://evidence-collector:50051")
    .tls_config(tls)?
    .connect()
    .await?;
```

### Key Rotation Admin API
```typescript
// POST /api/v1/admin/signing-keys/rotate
// Generates new Ed25519 key, stores in registry, returns public key info
// Old keys remain in registry for verification

// DB schema for signing key registry:
export const signingKeys = pgTable("signing_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: varchar("key_id", { length: 64 }).notNull().unique(), // SHA-256(pubkey)[:16]
  publicKeyHex: varchar("public_key_hex", { length: 64 }).notNull(),
  isActive: boolean("is_active").notNull().default(false), // Only one active at a time
  activatedAt: timestamp("activated_at"),
  retiredAt: timestamp("retired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| samlify < 2.10.0 | samlify >= 2.10.0 | 2025 (CVE-2025-47949) | CRITICAL: versions < 2.10.0 have CVSS 9.9 signature wrapping bypass |
| Insecure gRPC (current) | mTLS gRPC | This phase | All internal channels authenticated and encrypted |
| Single signing key | Multi-key with rotation | This phase | Operational key management without evidence chain breaks |
| API key only auth | API key + SAML SSO | This phase | Enterprise IdP integration for bank pilot |

**Deprecated/outdated:**
- passport-saml (old package): Use @node-saml/passport-saml or samlify instead
- samlify < 2.10.0: Critical CVE, signature wrapping bypass

## Open Questions

1. **samlify Bun Compatibility**
   - What we know: samlify depends on xml-crypto which uses Node.js native crypto. Bun implements most crypto APIs but not all.
   - What's unclear: Whether xml-crypto's specific C14N and signature verification code paths work on Bun.
   - Recommendation: First task in Phase 10 should be a PoC: install samlify, create SP/IdP pair, verify SAML assertion processing works on Bun. If it fails, fallback to @node-saml/node-saml (which is lower-level but may have fewer Node.js-specific dependencies) or use `@authenio/samlify-xsd-schema-validator` which some users report works on Bun.

2. **SAML Session Token Format**
   - What we know: Current auth uses API key stored in httpOnly cookie. SAML users don't have API keys.
   - What's unclear: Whether to use JWT or opaque session tokens for SAML-authenticated sessions.
   - Recommendation: Use opaque session tokens stored in a `sessions` PostgreSQL table. JWTs are harder to revoke and the control plane already has a database. The auth middleware should check: (1) is token an API key (starts with `ik_live_`)? If yes, API key flow. (2) Otherwise, look up session token in DB. This is cleaner than JWT and matches the existing database-backed auth pattern.

3. **IdP Metadata Management**
   - What we know: Okta and Azure AD both expose SAML metadata XML endpoints.
   - What's unclear: Whether to fetch metadata dynamically or require admin to upload it.
   - Recommendation: For v1.1, admin uploads metadata XML via a file path or admin API. Dynamic metadata fetching is a v1.2 enhancement. The bank pilot will have a known IdP configured at deployment time.

4. **Certificate Lifecycle in Docker Compose**
   - What we know: Docker Compose volumes persist between restarts.
   - What's unclear: Cert expiry handling and rotation for internal mTLS CA.
   - Recommendation: Generate long-lived internal CA (10 years) and shorter service certs (1 year). For v1.1, manual cert regeneration is acceptable. Kubernetes/Helm phase (12) can use cert-manager for automation.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `crates/evidence-collector/src/signing/` -- Ed25519 signing implementation
- Existing codebase: `crates/interdict-verify/src/signature.rs` -- Multi-key verification already implemented
- Existing codebase: `control-plane/src/modules/distribution/server.ts` -- Current insecure gRPC setup (line 278: `createInsecure()`)
- Existing codebase: `control-plane/src/db/schema/organization.ts` -- `externalId` column already exists on users table (line 53)
- [tonic transport docs](https://docs.rs/tonic/latest/tonic/transport/index.html) -- ServerTlsConfig, ClientTlsConfig API
- [samlify official docs](https://samlify.js.org/) -- SP configuration, assertion parsing

### Secondary (MEDIUM confidence)
- [CVE-2025-47949 analysis](https://www.endorlabs.com/learn/cve-2025-47949-reveals-flaw-in-samlify-that-opens-door-to-saml-single-sign-on-bypass) -- Critical vulnerability in samlify < 2.10.0
- [@grpc/grpc-js mTLS examples](https://dev.to/notmedia/how-to-setup-and-test-tls-in-grpcgrpc-web-485m) -- ServerCredentials.createSsl with client cert requirement
- [tonic mTLS patterns](https://github.com/hyperium/tonic) -- GitHub examples for mutual TLS

### Tertiary (LOW confidence)
- samlify + Bun compatibility: No direct source found confirming compatibility. STATE.md already flags this as requiring a PoC spike.
- @authenio/samlify-xsd-schema-validator on Bun: Community reports only, not officially verified.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - samlify is well-documented but Bun compatibility is unverified; tonic/grpc-js mTLS is well-documented
- Architecture: HIGH - patterns follow existing codebase conventions, all integration points identified
- Pitfalls: HIGH - concrete risks identified from codebase analysis and known CVEs
- Key rotation: HIGH - existing `verify_bundle_signatures` already handles multi-key lookup via HashMap

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain, but check samlify releases for security patches)
