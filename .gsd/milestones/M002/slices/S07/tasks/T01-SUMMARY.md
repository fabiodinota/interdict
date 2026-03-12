---
id: T01
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
# T01: 13-deployment-wiring-saml-key-rotation 01

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
