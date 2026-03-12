---
id: S07
parent: M002
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
# S07: Deployment Wiring Saml Key Rotation

**# Phase 13 Plan 01: SAML + Key Rotation Deployment Wiring Summary**

## What Happened

# Phase 13 Plan 01: SAML + Key Rotation Deployment Wiring Summary

**Docker Compose SAML SSO wiring, signing key rotation shared volume, SAML SP cert generation, and MODULES array fix to 13 modules**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-03T22:20:11Z
- **Completed:** 2026-03-03T22:21:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Wired all SAML env vars (entity ID, base URL, key/cert paths, IdP metadata) into docker-compose.yml control-plane service
- Connected signing key rotation via shared Docker volume (signing_keys) between control-plane and evidence-collector
- Added SAML SP self-signed certificate generation to cert-init script (ECDSA P-256, 3-year validity)
- Added NEXT_PUBLIC_ build args to dashboard Dockerfile and docker-compose.yml for SSO button enablement
- Fixed MODULES array from 10 to 13 entries (added reviews, department-overrides, anomalies)
- Documented complete SAML and key rotation setup in env.example with operator-facing comments

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker Compose SAML + key rotation wiring and env.example documentation** - `e78f0f5` (feat)
2. **Task 2: Extend cert-init script with SAML SP certificate generation** - `0f9163a` (feat)

## Files Created/Modified
- `env.example` - Added SAML SSO (8 vars) and Signing Key Rotation (2 vars) sections with operator docs
- `docker-compose.yml` - SAML env vars on control-plane, signing_keys volume on control-plane, SIGNING_KEY_WATCH_PATH on evidence-collector, build args on dashboard
- `docker/dashboard/Dockerfile` - ARG/ENV for NEXT_PUBLIC_SAML_ENABLED and NEXT_PUBLIC_API_URL before build step
- `control-plane/src/index.ts` - MODULES array updated to include reviews, department-overrides, anomalies
- `docker/certs/generate-internal-ca.sh` - SAML SP cert generation section added (step 5), permissions renumbered to step 6

## Decisions Made
- SAML SP cert is self-signed (not CA-signed) because SAML SP certs are registered directly with IdP and don't need CA chain
- signing_keys volume mounted read-write on both services (control-plane writes, evidence-collector reads via mtime poll)
- NEXT_PUBLIC_ vars set as both build args (for Next.js build-time inlining) and runtime env (for documentation/consistency)
- Config bind mount (./config:/config:ro) for operator-provided idp-metadata.xml

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All SAML and key rotation deployment wiring is in place
- Ready for 13-02 (validation/smoke test plan)
- Operator can now enable SAML by: setting env vars, providing idp-metadata.xml, rebuilding dashboard

---
*Phase: 13-deployment-wiring-saml-key-rotation*
*Completed: 2026-03-03*

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
