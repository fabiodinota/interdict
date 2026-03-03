---
phase: 12-kubernetes-deployment
plan: 01
subsystem: infra
tags: [helm, kubernetes, k8s, deployment, mtls, bitnami, postgresql, clickhouse, minio]

requires:
  - phase: 08-docker-compose
    provides: Dockerfiles and docker-compose.yml service definitions to translate into K8s
  - phase: 10-advanced-identity
    provides: mTLS cert bootstrap script and cert volume patterns

provides:
  - Complete Helm chart at helm/interdict/ with all service templates
  - Chart.yaml with conditional Bitnami subchart dependencies
  - values.yaml mapping all env.example variables with resource limits
  - cert-init pre-install hook Job for mTLS certificate generation
  - minio-init post-install hook Job for evidence bucket creation
  - Kubernetes Deployment + Service for kernel, control-plane, evidence-collector, dashboard
  - Ingress template for dashboard external access
  - Init containers for dependency ordering (wait for postgres, clickhouse, control-plane)

affects: [12-02, 12-03, deployment, operations]

tech-stack:
  added: [helm-v3, bitnami-subcharts]
  patterns: [helm-values-hierarchy, existingSecret-pattern, pre-install-hook, init-container-wait]

key-files:
  created:
    - helm/interdict/Chart.yaml
    - helm/interdict/values.yaml
    - helm/interdict/.helmignore
    - helm/interdict/templates/_helpers.tpl
    - helm/interdict/templates/NOTES.txt
    - helm/interdict/templates/cert-init-job.yaml
    - helm/interdict/templates/configmap-cert-script.yaml
    - helm/interdict/templates/secret-tls.yaml
    - helm/interdict/templates/minio-init-job.yaml
    - helm/interdict/templates/control-plane/deployment.yaml
    - helm/interdict/templates/control-plane/service.yaml
    - helm/interdict/templates/control-plane/configmap.yaml
    - helm/interdict/templates/evidence-collector/deployment.yaml
    - helm/interdict/templates/evidence-collector/service.yaml
    - helm/interdict/templates/kernel/deployment.yaml
    - helm/interdict/templates/kernel/service.yaml
    - helm/interdict/templates/kernel/configmap.yaml
    - helm/interdict/templates/dashboard/deployment.yaml
    - helm/interdict/templates/dashboard/service.yaml
    - helm/interdict/templates/dashboard/ingress.yaml
  modified: []

key-decisions:
  - "Used ghcr.io/interdict/ as default image registry per research recommendation"
  - "PVC for cert storage (not Secret) since cert-init Job generates certs at runtime"
  - "existingSecret pattern for all passwords; never real passwords in values.yaml"
  - "busybox init containers for dependency ordering instead of K8s native pod dependencies"
  - "TCP socket probes for kernel (TLS-only port) vs HTTP GET probes for control-plane/dashboard"
  - "Certs PVC annotated with helm.sh/resource-policy: keep to survive uninstalls"

patterns-established:
  - "Helm values hierarchy: global -> service -> subsection for consistent structure"
  - "existingSecret pattern: every password field has a corresponding existingSecret override"
  - "Init container wait pattern: busybox wget loop checking service readiness before main container starts"
  - "Component labels: app.kubernetes.io/component distinguishes services sharing the same app name"

requirements-completed: [DEPLOY-03]

duration: 3min
completed: 2026-03-03
---

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
