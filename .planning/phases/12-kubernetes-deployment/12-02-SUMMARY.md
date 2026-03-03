---
phase: 12-kubernetes-deployment
plan: 02
subsystem: infra
tags: [helm, kubernetes, sidecar, kep-753, iptables, traffic-redirect, pilot, enterprise]

requires:
  - phase: 12-kubernetes-deployment
    plan: 01
    provides: Helm chart foundation with values.yaml, _helpers.tpl, and service templates

provides:
  - Reusable sidecar container template (KEP-753 native sidecar pattern)
  - iptables traffic redirect init container for transparent AI vendor proxying
  - Example application Deployment demonstrating sidecar injection
  - Pilot values overlay for single-node self-contained deployment
  - Enterprise values overlay for HA multi-node with BYO infrastructure

affects: [12-03, deployment, operations, sidecar-injection]

tech-stack:
  added: []
  patterns: [kep-753-native-sidecar, iptables-traffic-redirect, http-proxy-cooperative-mode, values-overlay-profiles]

key-files:
  created:
    - helm/interdict/templates/sidecar/_sidecar-container.tpl
    - helm/interdict/templates/sidecar/_sidecar-init.tpl
    - helm/interdict/templates/sidecar/example-app.yaml
    - helm/interdict/values-pilot.yaml
    - helm/interdict/values-enterprise.yaml
  modified:
    - helm/interdict/values.yaml

key-decisions:
  - "Sidecar allowlistVendors as YAML list (not JSON string) for template range iteration"
  - "Both iptables and HTTP_PROXY modes supported via sidecar.trafficRedirect.enabled toggle"
  - "Enterprise overlay disables all infra subcharts with commented --set examples for managed services"
  - "Example app uses nginx:alpine as placeholder AI application"

patterns-established:
  - "KEP-753 sidecar pattern: initContainer with restartPolicy: Always for pod-lifetime sidecars"
  - "Dual traffic routing: iptables redirect (transparent) vs HTTP_PROXY (cooperative) via values toggle"
  - "Values overlay files: -f values-pilot.yaml or -f values-enterprise.yaml for deployment profiles"

requirements-completed: [DEPLOY-04]

duration: 2min
completed: 2026-03-03
---

# Phase 12 Plan 02: Sidecar Injection & Environment Overlays Summary

**KEP-753 native sidecar templates with iptables/HTTP_PROXY dual-mode traffic routing and pilot/enterprise deployment profiles**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T21:36:43Z
- **Completed:** 2026-03-03T21:38:49Z
- **Tasks:** 2
- **Files created:** 5
- **Files modified:** 1

## Accomplishments

- Created reusable sidecar container template using KEP-753 native sidecar pattern (restartPolicy: Always on initContainer)
- Created iptables init container template for transparent AI vendor traffic redirect with NET_ADMIN capability
- Built example Deployment showing both traffic routing modes (iptables transparent and HTTP_PROXY cooperative)
- Created pilot overlay with single replicas, small resources, and all bundled infrastructure subcharts enabled
- Created enterprise overlay with HA replicas (3 kernel, 2 control-plane), nginx ingress with TLS, and disabled subcharts for BYO infrastructure

## Task Commits

Each task was committed atomically:

1. **Task 1: Sidecar injection templates with traffic redirect** - `e6ac3aa` (feat)
2. **Task 2: Pilot and enterprise values overlay files** - `4f29d35` (feat)

## Files Created/Modified

- `helm/interdict/templates/sidecar/_sidecar-container.tpl` - Named template for KEP-753 kernel sidecar container with all KERNEL_* env vars
- `helm/interdict/templates/sidecar/_sidecar-init.tpl` - Named template for iptables NAT redirect init container (NET_ADMIN only, not privileged)
- `helm/interdict/templates/sidecar/example-app.yaml` - Example Deployment with nginx:alpine showing both traffic routing modes
- `helm/interdict/values.yaml` - Added sidecar section with resources, trafficRedirect, allowlistVendors, and exampleApp config
- `helm/interdict/values-pilot.yaml` - Small footprint overlay: 1 replica each, bundled PostgreSQL/ClickHouse/MinIO
- `helm/interdict/values-enterprise.yaml` - HA overlay: 3 kernel / 2 control-plane replicas, ingress with TLS, BYO infrastructure

## Decisions Made

- **Sidecar allowlistVendors as YAML list:** Used list format (not JSON string) so Helm range template can iterate directly
- **Dual traffic routing modes:** Both iptables (transparent, requires NET_ADMIN) and HTTP_PROXY (cooperative, no special caps) supported via toggle
- **Enterprise BYO infrastructure:** All three infra subcharts disabled; commented examples show --set patterns for managed services
- **Example app placeholder:** nginx:alpine used as stand-in for any AI-consuming application

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Sidecar injection templates ready for operators to copy into their own Deployments
- Plan 03 (CA trust scripts) can proceed independently
- After Plan 03 completes, Phase 12 and the v1.1 milestone will be fully complete

## Self-Check: PASSED

All 5 created files verified present on disk. Both task commits (e6ac3aa, 4f29d35) verified in git log.

---
*Phase: 12-kubernetes-deployment*
*Completed: 2026-03-03*
