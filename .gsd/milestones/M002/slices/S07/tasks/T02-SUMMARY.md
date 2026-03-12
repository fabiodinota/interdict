---
id: T02
parent: S07
milestone: M002
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T02: 13-deployment-wiring-saml-key-rotation 02

**# Phase 13 Plan 02: SAML SSO and Key Rotation Helm Wiring Summary**

## What Happened

# Phase 13 Plan 02: SAML SSO and Key Rotation Helm Wiring Summary

SAML SSO conditional deployment wiring and signing-key shared PVC replacing emptyDir in Helm chart templates.

## What Was Done

### Task 1: Helm values.yaml and signing-keys PVC (3ee624a)

Added four new configuration sections to values.yaml:
- `controlPlane.saml` -- Full SAML SSO configuration (entity ID, base URL, key/cert paths, IdP metadata secret)
- `controlPlane.signingKey` -- Output path for key rotation writes
- `evidenceCollector.signingKey` -- Watch path for hot-reload polling
- `dashboard.saml` -- SAML-enabled flag and API URL for SSO button

Added `signingKeysPvcSize` top-level value (default 10Mi) and a second PVC resource in cert-init-job.yaml for signing-keys with the same pattern as the existing certs PVC (ReadWriteOnce, helm.sh/resource-policy: keep).

### Task 2: Helm templates for SAML env vars, signing-key volumes, and cert-script (dc9f03a)

Five template files updated:
- **control-plane/configmap.yaml**: Added SIGNING_KEY_OUTPUT_PATH (always) and six SAML env vars (conditional on saml.enabled)
- **control-plane/deployment.yaml**: Added signing-keys PVC volumeMount and saml-config volume (from existing Secret or emptyDir placeholder)
- **evidence-collector/deployment.yaml**: Added SIGNING_KEY_WATCH_PATH env var; replaced emptyDir with shared signing-keys PVC claim
- **dashboard/deployment.yaml**: Added conditional NEXT_PUBLIC_SAML_ENABLED and NEXT_PUBLIC_API_URL env vars
- **configmap-cert-script.yaml**: Added idempotent SAML SP self-signed certificate generation (ECDSA P-256, 3-year validity)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **ReadWriteOnce PVC**: Sufficient for single-replica pilot where control-plane and evidence-collector share a node.
2. **SAML SP cert always generated**: cert-init creates saml-sp.key/crt idempotently regardless of saml.enabled; the conditional wiring is only in deployment templates.
3. **Dashboard NEXT_PUBLIC_ vars as documentation**: Since Next.js inlines these at build time, the Helm values document expected build-time configuration.

## Verification Results

- values.yaml contains `saml:`, `signingKeysPvcSize`, `signingKey:` sections
- cert-init-job.yaml contains `signing-keys` PVC definition
- control-plane configmap has `SIGNING_KEY_OUTPUT_PATH`
- control-plane deployment mounts `signing-keys` volume
- evidence-collector has `SIGNING_KEY_WATCH_PATH` and uses PVC (not emptyDir) for signing-keys
- dashboard has `NEXT_PUBLIC_SAML_ENABLED` conditional
- cert-init script has `saml-sp` certificate generation
- Helm CLI not available locally; template validation skipped (grep-based verification passed)
