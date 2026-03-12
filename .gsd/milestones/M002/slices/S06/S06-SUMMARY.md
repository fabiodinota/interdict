---
id: S06
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
# S06: Kubernetes Deployment

**# Phase 12 Plan 01: Helm Chart Foundation Summary**

## What Happened

# Phase 12 Plan 01: Helm Chart Foundation Summary

**Complete Helm chart with 20 files translating docker-compose.yml 1:1 into Kubernetes resources with Bitnami subcharts, mTLS cert bootstrap, and security contexts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T21:30:59Z
- **Completed:** 2026-03-03T21:34:21Z
- **Tasks:** 2
- **Files created:** 20

## Accomplishments

- Created complete Helm chart at helm/interdict/ with all four Interdict services as Kubernetes Deployments
- Mapped every environment variable from env.example to values.yaml with existingSecret pattern for secrets
- Cert-init Job runs as pre-install Helm hook executing the existing generate-internal-ca.sh script
- MinIO-init Job runs as post-install hook creating the evidence bucket
- All containers have resource requests/limits, security contexts (runAsNonRoot, allowPrivilegeEscalation: false), and health probes
- Conditional Bitnami subcharts for PostgreSQL, ClickHouse, and MinIO (can be disabled for BYO infrastructure)

## Task Commits

Each task was committed atomically:

1. **Task 1: Chart foundation, helpers, values, and cert bootstrap** - `12a0899` (feat)
2. **Task 2: Service deployment templates (all four Interdict services)** - `595d7d8` (feat)

## Files Created/Modified

- `helm/interdict/Chart.yaml` - Chart metadata with 3 Bitnami subchart dependencies
- `helm/interdict/values.yaml` - 292-line values file covering all env.example variables
- `helm/interdict/.helmignore` - Standard Helm ignore patterns
- `helm/interdict/templates/_helpers.tpl` - Name, fullname, labels, selector, image helpers
- `helm/interdict/templates/NOTES.txt` - Post-install instructions with port-forward commands
- `helm/interdict/templates/cert-init-job.yaml` - Pre-install hook Job with PVC for cert output
- `helm/interdict/templates/configmap-cert-script.yaml` - Embedded generate-internal-ca.sh with K8s DNS SANs
- `helm/interdict/templates/secret-tls.yaml` - Template for operator-provided TLS certs
- `helm/interdict/templates/minio-init-job.yaml` - Post-install hook for evidence bucket creation
- `helm/interdict/templates/control-plane/deployment.yaml` - Control plane with postgres init container
- `helm/interdict/templates/control-plane/service.yaml` - ClusterIP with HTTP (3000) and gRPC (50052) ports
- `helm/interdict/templates/control-plane/configmap.yaml` - All control plane env vars
- `helm/interdict/templates/evidence-collector/deployment.yaml` - Evidence collector with clickhouse init container
- `helm/interdict/templates/evidence-collector/service.yaml` - ClusterIP with gRPC port (50051)
- `helm/interdict/templates/kernel/deployment.yaml` - Kernel proxy with control-plane init container
- `helm/interdict/templates/kernel/service.yaml` - ClusterIP with HTTPS port (8443)
- `helm/interdict/templates/kernel/configmap.yaml` - All KERNEL_* env vars including mTLS paths
- `helm/interdict/templates/dashboard/deployment.yaml` - Dashboard with control-plane init container
- `helm/interdict/templates/dashboard/service.yaml` - ClusterIP with HTTP port (3001)
- `helm/interdict/templates/dashboard/ingress.yaml` - Conditional Ingress with className, hosts, TLS

## Decisions Made

- **ghcr.io/interdict/ default registry:** Per research recommendation; overridable via global.imageRegistry
- **PVC for certs (not Secret):** cert-init Job generates certs at runtime into a PVC; services mount it read-only
- **existingSecret pattern everywhere:** No real passwords in values.yaml; operators set via --set or existing Secrets
- **busybox init containers:** wget/nc loops for dependency ordering (simpler than native pod dependencies)
- **TCP socket probes for kernel:** Kernel only serves TLS on 8443; HTTP GET probes would fail without client cert
- **Certs PVC keep annotation:** helm.sh/resource-policy: keep prevents cert data loss on helm uninstall
- **ConfigMap cert-script as hook:** Hook weight -10 ensures ConfigMap exists before cert-init Job runs at -5

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Helm chart foundation complete; ready for Plan 02 (sidecar injection templates)
- Plan 03 (CA trust scripts) can proceed in parallel as it has no dependency on the chart templates

## Self-Check: PASSED

All 20 files verified present on disk. Both task commits (12a0899, 595d7d8) verified in git log.

---
*Phase: 12-kubernetes-deployment*
*Completed: 2026-03-03*

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

# Phase 12 Plan 03: CA Trust Scripts Summary

**Cross-platform CA certificate trust installer scripts for macOS, Linux (Debian + RHEL), and Windows with validation, colored output, and install/remove modes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T21:31:02Z
- **Completed:** 2026-03-03T21:32:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Shell script supporting macOS (security CLI), Debian/Ubuntu (update-ca-certificates), and RHEL/CentOS (update-ca-trust)
- PowerShell script with Import-Certificate to Windows Trusted Root store
- Both scripts validate prerequisites (root/admin, file exists, valid PEM) before modifying trust stores
- Both scripts support removal mode (--remove / -Remove)
- Colored success/error output with certificate subject/issuer/fingerprint display

## Task Commits

Each task was committed atomically:

1. **Task 1: macOS/Linux CA trust installer script** - `ed57f01` (feat)
2. **Task 2: Windows CA trust installer script (PowerShell)** - `eb1eaa2` (feat)

## Files Created/Modified
- `scripts/install-ca-trust.sh` - macOS and Linux CA certificate installer with platform detection
- `scripts/install-ca-trust.ps1` - Windows CA certificate installer with PowerShell help docs

## Decisions Made
- Shell script uses ANSI color codes for colored output rather than tput (simpler, works on most terminals)
- PEM validation via `openssl x509 -noout` before any trust store modification to catch bad input early
- Windows removal uses subject name matching (`-match "interdict"`) rather than requiring a thumbprint
- Shell script header clearly distinguishes proxy CA (for browsers) from internal mTLS CA (for services)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CA trust scripts ready for operator use alongside Helm chart (Plans 01/02)
- Scripts reference the CA cert generated by `docker/certs/generate-internal-ca.sh` and the Helm cert-init Job

## Self-Check: PASSED

- [x] scripts/install-ca-trust.sh exists
- [x] scripts/install-ca-trust.ps1 exists
- [x] Commit ed57f01 found
- [x] Commit eb1eaa2 found

---
*Phase: 12-kubernetes-deployment*
*Completed: 2026-03-03*
