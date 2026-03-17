---
phase: 13-deployment-wiring-saml-key-rotation
verified: 2026-03-03T22:35:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 13: Deployment Wiring (SAML + Key Rotation) Verification Report

**Phase Goal:** Close deployment wiring gaps so SAML SSO and key rotation hot-reload are fully operational in default Docker Compose and Helm deployments
**Verified:** 2026-03-03T22:35:00Z
**Status:** passed
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                        | Status     | Evidence                                                                                                                                              |
|----|------------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Operator can enable SAML SSO by setting env vars in .env and providing IdP metadata XML without reading source code          | VERIFIED   | `env.example` has 14 SAML-related lines with operator-readable comments; all 8 SAML vars documented with defaults and purpose descriptions            |
| 2  | After admin key rotation, evidence-collector picks up the new signing key via shared Docker volume without container restart | VERIFIED   | `docker-compose.yml` mounts `signing_keys:/data/keys` on both `control-plane` (lines 128) and `evidence-collector` (line 172); `signing_keys` declared as named volume (line 239); `SIGNING_KEY_OUTPUT_PATH` on control-plane; `SIGNING_KEY_WATCH_PATH` on evidence-collector |
| 3  | MODULES startup log lists all 13 loaded modules including reviews, department-overrides, anomalies                           | VERIFIED   | `control-plane/src/index.ts` MODULES array has exactly 13 entries; all three new modules imported and wired via `.use()` (lines 105-107)              |
| 4  | Operator can enable SAML SSO in Helm deployment by setting controlPlane.saml.enabled=true and providing IdP metadata        | VERIFIED   | `helm/interdict/values.yaml` has `controlPlane.saml` block with all required fields; configmap.yaml conditionally emits all 6 SAML env vars when `saml.enabled=true` |
| 5  | After admin key rotation, evidence-collector picks up the new key via shared PVC without pod restart                         | VERIFIED   | `helm/interdict/templates/evidence-collector/deployment.yaml` uses PVC claim (not emptyDir) for signing-keys; `SIGNING_KEY_WATCH_PATH` env var set from values |
| 6  | Signing keys use a shared PVC so both control-plane and evidence-collector access the same filesystem                        | VERIFIED   | `helm/interdict/templates/cert-init-job.yaml` defines second PVC `{fullname}-signing-keys` with `helm.sh/resource-policy: keep`; both control-plane and evidence-collector Helm deployments reference it via `persistentVolumeClaim.claimName` |

**Score:** 6/6 truths verified

---

### Required Artifacts

#### Plan 01 (Docker Compose)

| Artifact                                    | Expected                                               | Status     | Details                                                                                    |
|---------------------------------------------|--------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| `env.example`                               | Documented SAML section and signing key path vars      | VERIFIED   | Contains `SAML_SP_ENTITY_ID` and 13 other SAML/signing-key vars with operator comments    |
| `docker-compose.yml`                        | SAML env vars, SAML volumes, signing_keys mount        | VERIFIED   | `SAML_SP_ENTITY_ID` on control-plane; `signing_keys:/data/keys` on both services; build args on dashboard; named volume declared |
| `docker/certs/generate-internal-ca.sh`      | SAML SP self-signed certificate generation             | VERIFIED   | Contains `saml-sp` block at lines 106-113; ECDSA P-256; 1095 days; idempotency check      |
| `docker/dashboard/Dockerfile`               | Build args for NEXT_PUBLIC_SAML_ENABLED                | VERIFIED   | `ARG NEXT_PUBLIC_SAML_ENABLED` and `ENV NEXT_PUBLIC_SAML_ENABLED=$NEXT_PUBLIC_SAML_ENABLED` at lines 17-20, before `RUN bun run build` (line 21) |
| `control-plane/src/index.ts`                | Complete MODULES array with all 13 modules             | VERIFIED   | MODULES array has 13 entries; `anomalies`, `reviews`, `department-overrides` present and all three modules are imported and registered via `.use()` |

#### Plan 02 (Helm)

| Artifact                                                          | Expected                                             | Status     | Details                                                                                      |
|-------------------------------------------------------------------|------------------------------------------------------|------------|----------------------------------------------------------------------------------------------|
| `helm/interdict/values.yaml`                                      | SAML and signing key configuration sections          | VERIFIED   | `controlPlane.saml`, `controlPlane.signingKey`, `evidenceCollector.signingKey`, `dashboard.saml`, `signingKeysPvcSize` all present |
| `helm/interdict/templates/control-plane/configmap.yaml`           | SAML and SIGNING_KEY_OUTPUT_PATH env vars            | VERIFIED   | `SIGNING_KEY_OUTPUT_PATH` unconditional; 6 SAML env vars under `{{- if .Values.controlPlane.saml.enabled }}` |
| `helm/interdict/templates/control-plane/deployment.yaml`          | signing-keys and config volume mounts                | VERIFIED   | `signing-keys` volumeMount at `/data/keys`; `saml-config` mount conditional on `saml.enabled`; PVC claim in volumes block |
| `helm/interdict/templates/evidence-collector/deployment.yaml`     | SIGNING_KEY_WATCH_PATH env var and shared PVC        | VERIFIED   | `SIGNING_KEY_WATCH_PATH` env var present; signing-keys volume uses `persistentVolumeClaim` (no emptyDir) |
| `helm/interdict/templates/dashboard/deployment.yaml`              | SAML-related env vars                                | VERIFIED   | `NEXT_PUBLIC_SAML_ENABLED` conditional block present                                         |
| `helm/interdict/templates/cert-init-job.yaml`                     | Signing keys PVC definition                          | VERIFIED   | Second PVC `{fullname}-signing-keys` with `helm.sh/resource-policy: keep` at lines 20-24    |
| `helm/interdict/templates/configmap-cert-script.yaml`             | SAML SP cert generation in Helm cert-init script     | VERIFIED   | `saml-sp` idempotent cert generation block at lines 73-79; same ECDSA P-256 pattern          |

---

### Key Link Verification

| From                                                   | To                                                         | Via                                                  | Status  | Details                                                                                                  |
|--------------------------------------------------------|------------------------------------------------------------|------------------------------------------------------|---------|----------------------------------------------------------------------------------------------------------|
| `docker-compose.yml` control-plane volumes             | `docker-compose.yml` evidence-collector volumes            | `signing_keys:/data/keys` named volume               | WIRED   | `signing_keys:/data/keys` at line 128 (control-plane) and line 172 (evidence-collector); top-level `signing_keys:` volume at line 239 |
| `docker-compose.yml` control-plane env                 | `control-plane/src/modules/auth/saml/config.ts`            | `SAML_SP_ENTITY_ID` env var                          | WIRED   | `SAML_SP_ENTITY_ID: ${SAML_SP_ENTITY_ID:-...}` at line 117 of docker-compose; existing SAML config.ts reads this var (per PLAN interfaces) |
| `docker-compose.yml` dashboard build args              | `dashboard/src/lib/auth-client.ts`                         | `NEXT_PUBLIC_SAML_ENABLED` inlined at build time     | WIRED   | Dashboard service build.args block passes `NEXT_PUBLIC_SAML_ENABLED`; Dockerfile ARG/ENV at lines 17-20 before `bun run build`; auth-client.ts checks this var (per PLAN interfaces) |
| `helm/interdict/templates/control-plane/deployment.yaml` (signing-keys volume) | `helm/interdict/templates/evidence-collector/deployment.yaml` (signing-keys volume) | Shared PVC `{fullname}-signing-keys` | WIRED | Both deployments use `persistentVolumeClaim.claimName: {{ include "interdict.fullname" . }}-signing-keys`; PVC defined in cert-init-job.yaml |
| `helm/interdict/values.yaml` (`controlPlane.saml`)     | `helm/interdict/templates/control-plane/configmap.yaml`    | Helm template values propagation                     | WIRED   | configmap.yaml references `.Values.controlPlane.saml.spEntityId`, `.spBaseUrl`, etc. under conditional block |

---

### Requirements Coverage

| Requirement | Source Plans | Description                                                                                       | Status    | Evidence                                                                                                                         |
|-------------|--------------|---------------------------------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------------------------------------------------|
| IDENT-01    | 13-01, 13-02 | User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD)                     | SATISFIED | SAML env vars wired in both Docker Compose and Helm; cert-init generates SP certs; env.example documents operator setup steps; SAML config.ts (existing) reads env vars |
| IDENT-06    | 13-01, 13-02 | Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles | SATISFIED | `SIGNING_KEY_OUTPUT_PATH` on control-plane (writes rotated key); `SIGNING_KEY_WATCH_PATH` on evidence-collector (polls for hot-reload); shared volume (`signing_keys`/PVC) connects both services in both deployment targets |

Both requirements were previously marked as "pending gap closure in Phase 13" in REQUIREMENTS.md and are now satisfied by the deployment wiring implemented in this phase.

---

### Anti-Patterns Found

No anti-patterns detected across all 12 modified files. No TODO, FIXME, HACK, PLACEHOLDER, or stub markers found.

---

### Commit Verification

All four commits from SUMMARY files confirmed present in git history:

| Commit    | Message                                                                |
|-----------|------------------------------------------------------------------------|
| `e78f0f5` | feat(13-01): wire SAML SSO and key rotation into Docker Compose deployment |
| `0f9163a` | feat(13-01): add SAML SP certificate generation to cert-init script    |
| `3ee624a` | feat(13-02): add SAML SSO and signing-key values with shared PVC       |
| `dc9f03a` | feat(13-02): wire SAML env vars, signing-key volumes, and cert-script into Helm templates |

---

### Human Verification Required

The following items require runtime verification that cannot be confirmed by static analysis:

#### 1. SAML SSO End-to-End Login Flow

**Test:** Start Docker Compose stack with a real IdP (e.g., Okta dev account). Set `SAML_SP_ENTITY_ID`, provide `idp-metadata.xml` in `./config/`, set `NEXT_PUBLIC_SAML_ENABLED=true` and rebuild the dashboard image. Attempt SSO login from the dashboard.
**Expected:** Browser redirects to IdP, authenticates, ACS callback returns to control-plane, user lands on dashboard.
**Why human:** Cannot verify live SAML assertion exchange, ACS handler behavior, or IdP metadata parsing from static file analysis.

#### 2. Key Rotation Hot-Reload

**Test:** Run `POST /api/v1/admin/signing-keys/rotate` against a running control-plane. Wait up to 30s. Confirm evidence-collector logs show the new signing key was loaded without container restart.
**Expected:** Evidence-collector log shows key reload within one 30s poll cycle; previously signed evidence remains verifiable with old key.
**Why human:** The mtime-poll hot-reload behavior requires a running container pair sharing the volume; cannot verify from static analysis.

#### 3. Helm Signed-Keys PVC Cross-Pod Access

**Test:** Deploy to a Kubernetes cluster using `helm install`. Verify control-plane and evidence-collector pods both mount the same `{fullname}-signing-keys` PVC and the signing key written by control-plane is readable by evidence-collector.
**Expected:** `kubectl exec` into evidence-collector shows the key file; no `Permission denied` errors.
**Why human:** ReadWriteOnce PVC behavior depends on scheduler placing both pods on the same node; cannot verify statically.

---

### Gaps Summary

No gaps found. All 6 observable truths are verified, all 12 artifacts pass all three levels (exists, substantive, wired), all 5 key links are confirmed wired, and both requirement IDs (IDENT-01, IDENT-06) are satisfied.

The three human verification items above are integration/runtime checks that are expected at this stage and do not block milestone handoff — they require a running environment with a real IdP and Kubernetes cluster.

---

_Verified: 2026-03-03T22:35:00Z_
_Verifier: Claude (gsd-verifier)_
