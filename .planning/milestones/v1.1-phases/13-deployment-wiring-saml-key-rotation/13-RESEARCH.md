# Phase 13: Deployment Wiring for SAML & Key Rotation - Research

**Researched:** 2026-03-03
**Domain:** Deployment wiring / integration gap closure (Docker Compose, Helm, env configuration)
**Confidence:** HIGH

## Summary

Phase 13 closes two critical deployment wiring gaps identified in the v1.1 milestone audit, plus one cosmetic fix. The code for SAML SSO and key rotation hot-reload is fully implemented and verified -- the gaps are exclusively in deployment configuration (env vars, volume mounts, Helm values, and operator documentation).

This is not a feature-building phase. All application code exists. The work is purely additive configuration: adding env vars to docker-compose.yml, env.example, and Helm values/templates, adding volume mounts for SAML certs and IdP metadata, converting Helm signing-keys from emptyDir to a shared PVC, and adding a SAML SP cert generation script.

**Primary recommendation:** Wire existing SAML and key rotation code into deployment layers by adding missing env vars, volume mounts, and a SAML cert generation hook to Docker Compose and Helm. Fix MODULES array as a trivial one-line change.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-01 | User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) | SAML code complete (samlify 2.10.2, dual-mode auth, JIT provisioning). Gap: env vars (SAML_SP_KEY_PATH, SAML_SP_CERT_PATH, SAML_IDP_METADATA_PATH, SAML_SP_ENTITY_ID, SAML_SP_BASE_URL, DASHBOARD_URL, NEXT_PUBLIC_SAML_ENABLED, NEXT_PUBLIC_API_URL) not in docker-compose.yml, env.example, or Helm. No SAML SP cert generation. No IdP metadata volume mount. |
| IDENT-06 | Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles | Rotation API and RotatingSigningProvider with ArcSwap hot-reload verified. Gap: SIGNING_KEY_OUTPUT_PATH not in control-plane env, SIGNING_KEY_WATCH_PATH not in evidence-collector env, Helm signing-keys volume is emptyDir (pod-local, not shared). Docker Compose signing_keys volume exists but is not mounted to control-plane. |
</phase_requirements>

## Standard Stack

This phase requires no new libraries. All work is configuration-level changes to existing files.

### Core (Existing -- No New Dependencies)
| Component | Current Version | Purpose | Phase 13 Action |
|-----------|----------------|---------|-----------------|
| docker-compose.yml | N/A | Docker Compose orchestration | Add SAML env vars, SAML volumes, signing key env vars, signing_keys volume to control-plane |
| env.example | N/A | Env var documentation (single source of truth) | Add SAML section, SIGNING_KEY_OUTPUT_PATH, SIGNING_KEY_WATCH_PATH |
| helm/interdict/values.yaml | N/A | Helm chart values | Add SAML section, signing key output/watch paths |
| control-plane/src/index.ts | N/A | Control plane entry point | Update MODULES array |
| openssl | Alpine package | Self-signed cert generation | Add SAML SP cert generation to cert-init |

### No New Libraries Required
This phase is pure configuration wiring. Zero npm/cargo dependencies to add.

## Architecture Patterns

### Gap 1: SAML Deployment Activation Path

**Current state:** SAML config in `control-plane/src/modules/auth/saml/config.ts` reads these env vars with defaults:
- `SAML_SP_ENTITY_ID` (default: `https://interdict.example.com/saml/metadata`)
- `SAML_SP_KEY_PATH` (default: `/certs/saml-sp.key`)
- `SAML_SP_CERT_PATH` (default: `/certs/saml-sp.crt`)
- `SAML_IDP_METADATA_PATH` (default: `/config/idp-metadata.xml`)
- `SAML_SP_BASE_URL` (default: `http://localhost:3000`)

SAML is auto-enabled when all three files exist (SP key, SP cert, IdP metadata). There is no explicit on/off toggle -- presence of files IS the toggle.

**Dashboard side:** `auth-client.ts` checks `NEXT_PUBLIC_SAML_ENABLED=true` to show the SSO button. `getSsoUrl()` reads `NEXT_PUBLIC_API_URL` for the redirect target.

**SAML handler:** `handlers.ts` reads `DASHBOARD_URL` for post-ACS redirect.

**What needs wiring:**

1. **env.example** -- Add documented SAML section with all env vars
2. **docker-compose.yml control-plane** -- Add SAML_SP_ENTITY_ID, SAML_SP_BASE_URL, SIGNING_KEY_OUTPUT_PATH, DASHBOARD_URL env vars; add volume mounts for `/config/` (IdP metadata bind mount)
3. **docker-compose.yml dashboard** -- Add NEXT_PUBLIC_SAML_ENABLED, NEXT_PUBLIC_API_URL env vars
4. **docker-compose.yml cert-init** -- Extend script to generate SAML SP self-signed cert/key pair alongside the existing mTLS certs; write to certs volume at saml-sp.key/saml-sp.crt
5. **Helm values.yaml** -- Add `controlPlane.saml.*` section with all SAML paths and dashboard SAML env
6. **Helm control-plane configmap** -- Add SAML env vars from values
7. **Helm control-plane deployment** -- Add `/config/` volume mount for IdP metadata (ConfigMap or user-provided Secret)
8. **Helm dashboard deployment** -- Add NEXT_PUBLIC_SAML_ENABLED, NEXT_PUBLIC_API_URL env vars

### Gap 2: Key Rotation File Delivery

**Current state of key rotation flow:**
1. Admin calls `POST /api/v1/admin/signing-keys/rotate`
2. Control plane generates Ed25519 keypair, stores public key in Postgres, writes raw 32-byte private key to `SIGNING_KEY_OUTPUT_PATH` (default: undefined/skipped)
3. Evidence collector watches `SIGNING_KEY_WATCH_PATH` for file mtime changes (30s poll)
4. On mtime change, evidence collector calls `RotatingSigningProvider::reload_from_file()` for atomic ArcSwap

**Docker Compose gap:**
- `signing_keys` named volume exists but is only mounted to evidence-collector at `/data/keys`
- Control-plane has NO mount of `signing_keys` volume
- `SIGNING_KEY_OUTPUT_PATH` env var not set on control-plane
- `SIGNING_KEY_WATCH_PATH` env var not set on evidence-collector
- Both paths need to point to the SAME file on the shared volume

**Fix:** Mount `signing_keys` volume to control-plane (read-write at `/data/keys`), set `SIGNING_KEY_OUTPUT_PATH=/data/keys/signing.key` on control-plane, set `SIGNING_KEY_WATCH_PATH=/data/keys/signing.key` on evidence-collector, and change evidence-collector's `COLLECTOR_SIGNING_MODE` default to `file`.

**Helm gap:**
- `signing-keys` volume is `emptyDir: {}` (pod-local) -- separate pods for control-plane and evidence-collector get separate empty directories
- Need shared PVC (like the `certs` PVC pattern already used)
- Both deployments mount the shared PVC
- Add `SIGNING_KEY_OUTPUT_PATH` to control-plane configmap
- Add `SIGNING_KEY_WATCH_PATH` to evidence-collector env

### Gap 3: MODULES Array (Cosmetic)

**Current:** `control-plane/src/index.ts` line 33-44:
```typescript
const MODULES = [
  "auth", "policies", "compiler", "vendors", "regulatory",
  "audit", "reports", "distribution", "signing-keys", "evidence",
] as const;
```

**Missing:** `"reviews"`, `"department-overrides"`, `"anomalies"` (all three are `.use()`'d in the app but not in the logging array).

**Fix:** Add the three strings to the MODULES array. One-line change, zero runtime impact.

### Recommended Project Structure for Changes

```
env.example                                    # Add SAML section + signing key vars
docker-compose.yml                             # Add env vars + volume mounts
docker/certs/generate-internal-ca.sh           # Extend with SAML SP cert generation
control-plane/src/index.ts                     # Fix MODULES array
helm/interdict/values.yaml                     # Add saml + signingKey sections
helm/interdict/templates/control-plane/
  configmap.yaml                               # Add SAML + SIGNING_KEY_OUTPUT_PATH
  deployment.yaml                              # Add /config, /data/keys mounts
helm/interdict/templates/evidence-collector/
  deployment.yaml                              # Add SIGNING_KEY_WATCH_PATH env
helm/interdict/templates/dashboard/
  deployment.yaml                              # Add NEXT_PUBLIC_SAML_ENABLED env
helm/interdict/templates/
  configmap-cert-script.yaml                   # Extend SAML SP cert gen
  pvc-signing-keys.yaml                        # New: shared PVC for key material
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SAML SP certificate | Custom crypto code | `openssl req -x509 -newkey ec` in cert-init script | Self-signed SP cert for SAML signing; reuse existing Alpine+openssl pattern from mTLS cert-init |
| Shared volume in Helm | Sidecar containers for file sync | PVC (ReadWriteMany or ReadWriteOnce with co-scheduled pods) | Existing pattern used for certs PVC; signing-keys just needs the same treatment |
| IdP metadata delivery | Baked-in metadata | Bind mount (Docker) or ConfigMap/Secret (Helm) | Operator provides their own IdP-specific XML; it is external input |

## Common Pitfalls

### Pitfall 1: SAML SP Cert Must Be X.509, Not Just a Key Pair
**What goes wrong:** Generating a raw key pair without a self-signed certificate; samlify expects PEM-encoded X.509 cert for `signingCert`.
**Why it happens:** Confusion between TLS certs and SAML signing certs.
**How to avoid:** Use `openssl req -x509 -newkey ec -pkcs ec -days 3650 -nodes -subj "/CN=interdict-saml-sp"` to generate both key and self-signed cert.
**Warning signs:** samlify throws "invalid certificate" at startup.

### Pitfall 2: NEXT_PUBLIC_ Env Vars Are Build-Time in Next.js
**What goes wrong:** Setting `NEXT_PUBLIC_SAML_ENABLED=true` at runtime (in docker-compose env) but Next.js already baked the value at build time.
**Why it happens:** Next.js inlines `NEXT_PUBLIC_*` at build time via webpack DefinePlugin.
**How to avoid:** The dashboard Dockerfile must pass these as build args OR use runtime env injection. Since the dashboard container is built once and deployed to both environments, use a runtime approach: pass the env var at container startup and read it via a Next.js `publicRuntimeConfig` or a small runtime-env script. Alternatively, since the existing code already uses `process.env.NEXT_PUBLIC_SAML_ENABLED`, the simplest approach is to ensure the Dockerfile ARG/ENV includes these, or to use Next.js standalone mode's runtime env support.
**Warning signs:** SSO button never appears despite env var being set.

### Pitfall 3: Helm PVC Access Mode for Multi-Pod Signing Key Sharing
**What goes wrong:** Using `ReadWriteOnce` PVC when control-plane and evidence-collector are on different nodes.
**Why it happens:** RWO PVC can only be mounted by pods on the same node.
**How to avoid:** For single-replica deployments (pilot), RWO works if pods are co-scheduled. For multi-replica (enterprise), use a different strategy: either ensure control-plane writes to a path evidence-collector can reach (e.g., via API callback instead of shared file), or use `ReadWriteMany` storage class. Since the pilot deployments are single-replica each, `ReadWriteOnce` is sufficient. Document the limitation.
**Warning signs:** Evidence-collector pod stuck in Pending with "multi-attach error."

### Pitfall 4: Docker Compose Volume Not Mounted to Control-Plane
**What goes wrong:** `signing_keys` volume only mounted to evidence-collector; control-plane's `rotateKey()` writes to a path inside the container filesystem that gets lost.
**Why it happens:** Phase 10 added the API but Phase 8 didn't know about it.
**How to avoid:** Mount `signing_keys:/data/keys` to control-plane service. Ensure both services use the same file path.

### Pitfall 5: Evidence Collector Signing Mode Still Defaults to "dev"
**What goes wrong:** Even with `SIGNING_KEY_WATCH_PATH` set, if `COLLECTOR_SIGNING_MODE=dev`, the initial provider is ephemeral and the watch path file may not exist yet.
**Why it happens:** The watch task handles missing files gracefully (logs warning), but the initial signing mode is what determines the initial provider.
**How to avoid:** When key rotation is intended, set `COLLECTOR_SIGNING_MODE=file`. The watch task picks up subsequent rotations. For first deploy before any rotation, the evidence collector should start in dev mode and switch to file mode when the first key is rotated (or pre-seed a key).

## Code Examples

### SAML SP Cert Generation (extend cert-init script)
```bash
# Source: existing pattern in docker/certs/generate-internal-ca.sh
# Add after mTLS cert generation:

# SAML SP self-signed certificate (3-year validity)
if [ ! -f /certs/saml-sp.key ]; then
  echo "Generating SAML SP certificate..."
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
    -days 1095 -nodes \
    -keyout /certs/saml-sp.key \
    -out /certs/saml-sp.crt \
    -subj "/CN=interdict-saml-sp/O=Interdict"
  chmod 600 /certs/saml-sp.key
  echo "SAML SP certificate generated."
fi
```

### Docker Compose Control-Plane SAML Env Vars
```yaml
# Added to control-plane service environment block:
SAML_SP_ENTITY_ID: ${SAML_SP_ENTITY_ID:-https://interdict.example.com/saml/metadata}
SAML_SP_KEY_PATH: ${SAML_SP_KEY_PATH:-/certs/saml-sp.key}
SAML_SP_CERT_PATH: ${SAML_SP_CERT_PATH:-/certs/saml-sp.crt}
SAML_IDP_METADATA_PATH: ${SAML_IDP_METADATA_PATH:-/config/idp-metadata.xml}
SAML_SP_BASE_URL: ${SAML_SP_BASE_URL:-http://localhost:3000}
DASHBOARD_URL: ${DASHBOARD_URL:-http://localhost:8080}
SIGNING_KEY_OUTPUT_PATH: ${SIGNING_KEY_OUTPUT_PATH:-/data/keys/signing.key}
```

### Docker Compose Control-Plane Volume Mounts
```yaml
volumes:
  - certs:/certs:ro
  - signing_keys:/data/keys        # NEW: shared with evidence-collector
  - ./config:/config:ro             # NEW: IdP metadata bind mount
```

### Docker Compose Evidence-Collector Env Vars
```yaml
# Added to evidence-collector environment block:
SIGNING_KEY_WATCH_PATH: ${SIGNING_KEY_WATCH_PATH:-/data/keys/signing.key}
```

### Docker Compose Dashboard Env Vars
```yaml
# Added to dashboard environment block:
NEXT_PUBLIC_SAML_ENABLED: ${NEXT_PUBLIC_SAML_ENABLED:-false}
NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3000}
```

### Helm values.yaml SAML Section
```yaml
controlPlane:
  saml:
    # -- Enable SAML SSO deployment wiring
    enabled: false
    # -- SP entity ID (must match IdP configuration)
    spEntityId: "https://interdict.example.com/saml/metadata"
    # -- SP base URL (control plane external URL for ACS callback)
    spBaseUrl: ""
    # -- Dashboard URL for post-login redirect
    dashboardUrl: ""
    # -- Path to SP private key inside container
    spKeyPath: "/certs/saml-sp.key"
    # -- Path to SP certificate inside container
    spCertPath: "/certs/saml-sp.crt"
    # -- Path to IdP metadata XML inside container
    idpMetadataPath: "/config/idp-metadata.xml"
    # -- Name of existing Secret containing idp-metadata.xml
    existingIdpMetadataSecret: ""
    # -- Name of existing ConfigMap containing idp-metadata.xml
    existingIdpMetadataConfigMap: ""
  signingKey:
    # -- Path where rotated signing keys are written
    outputPath: "/data/keys/signing.key"

evidenceCollector:
  signingKey:
    # -- Path to watch for signing key file changes (hot-reload)
    watchPath: "/data/keys/signing.key"

dashboard:
  saml:
    # -- Enable SSO button in dashboard login page
    enabled: false
    # -- Control plane external URL for SSO redirect
    apiUrl: ""

signingKeysPvc:
  # -- Size of shared signing keys PVC
  size: "10Mi"
```

### MODULES Array Fix
```typescript
// control-plane/src/index.ts
const MODULES = [
  "auth",
  "policies",
  "compiler",
  "vendors",
  "regulatory",
  "audit",
  "reports",
  "distribution",
  "signing-keys",
  "evidence",
  "reviews",
  "department-overrides",
  "anomalies",
] as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SAML code without deployment wiring | Phase 13 adds deployment layer | Phase 13 | Operators can activate SAML via documented env vars |
| Key rotation without shared volume | Phase 13 adds shared PVC + env vars | Phase 13 | Zero-downtime key rotation works in default deployments |
| 10-module MODULES log | 13-module MODULES log | Phase 13 | Startup log accurately reflects loaded modules |

## Open Questions

1. **NEXT_PUBLIC_ build-time vs runtime**
   - What we know: Next.js standalone mode supports runtime env via `.env.production` at startup, but `NEXT_PUBLIC_*` vars are inlined at build time by default.
   - What's unclear: Whether the existing dashboard Dockerfile already handles this or needs modification.
   - Recommendation: Check the dashboard Dockerfile. If it uses multi-stage build with `next build`, NEXT_PUBLIC_* must be available at build time OR a runtime injection pattern must be used. The simplest fix is to add `ENV NEXT_PUBLIC_SAML_ENABLED=false` in the Dockerfile as a default and let docker-compose/Helm override it at build time, or use a runtime env script. Investigate the dashboard Dockerfile during planning.

2. **Signing key pre-seeding for file mode**
   - What we know: If `COLLECTOR_SIGNING_MODE=file` but no key file exists at the expected path, evidence-collector will fail to start.
   - What's unclear: Should the cert-init script also generate an initial signing key, or should it remain dev mode until first rotation?
   - Recommendation: Keep `COLLECTOR_SIGNING_MODE=dev` as default. After first admin-triggered rotation, the watch path will pick up the key. Document this two-step activation in env.example comments.

3. **Helm ReadWriteOnce limitation for multi-replica**
   - What we know: Enterprise overlay uses 2 control-plane and 2 evidence-collector replicas. RWO PVC cannot be mounted on different nodes simultaneously.
   - What's unclear: Whether enterprise deployments will always co-locate these pods.
   - Recommendation: Use RWO for the signing-keys PVC (matches the existing certs PVC pattern). Document the multi-replica limitation. A future improvement could use an API-based key delivery instead of filesystem sharing.

## Sources

### Primary (HIGH confidence)
- `control-plane/src/modules/auth/saml/config.ts` -- SAML env var names and defaults
- `control-plane/src/modules/auth/saml/handlers.ts` -- DASHBOARD_URL usage
- `dashboard/src/lib/auth-client.ts` -- NEXT_PUBLIC_SAML_ENABLED, NEXT_PUBLIC_API_URL usage
- `crates/evidence-collector/src/config.rs` -- SIGNING_KEY_WATCH_PATH env var
- `control-plane/src/modules/signing-keys/index.ts` -- SIGNING_KEY_OUTPUT_PATH usage
- `crates/evidence-collector/src/main.rs` -- File watcher spawn logic
- `docker-compose.yml` -- Current volume and env configuration
- `helm/interdict/values.yaml` -- Current Helm values (no SAML, emptyDir signing-keys)
- `.planning/v1.1-MILESTONE-AUDIT.md` -- Authoritative gap identification

### Secondary (MEDIUM confidence)
- Next.js documentation on NEXT_PUBLIC_ env var behavior (build-time inlining)

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH -- sourced from milestone audit and direct code inspection
- SAML wiring: HIGH -- all env var names verified from source code
- Key rotation wiring: HIGH -- all paths verified from config.rs and service.ts
- MODULES fix: HIGH -- trivial one-line change, verified from index.ts
- NEXT_PUBLIC_ runtime behavior: MEDIUM -- needs dashboard Dockerfile verification

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable -- no external dependency changes expected)
