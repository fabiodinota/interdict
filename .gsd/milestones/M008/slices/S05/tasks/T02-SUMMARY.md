---
id: T02
parent: S05
milestone: M008
provides:
  - Sidecar read-only rootfs with tmpfs for /tmp
  - ServiceAccount with namespace-scoped RBAC for secrets and configmaps
  - All pods and jobs reference dedicated ServiceAccount
key_files:
  - helm/interdict/templates/sidecar/_sidecar-container.tpl
  - helm/interdict/templates/serviceaccount.yaml
  - helm/interdict/templates/role.yaml
  - helm/interdict/templates/rolebinding.yaml
  - helm/interdict/values.yaml
key_decisions:
  - ServiceAccount defaults to create:true with automountServiceAccountToken:false for minimal attack surface
  - Role scoped to secrets+configmaps get/list only (least privilege for cert and config access)
  - Added runAsGroup:1000 and capabilities drop ALL to sidecar (was missing from original template)
patterns_established:
  - All pod specs reference serviceAccountName via interdict.serviceAccountName helper
  - ServiceAccount guarded by values.serviceAccount.create conditional
observability_surfaces:
  - "helm template interdict helm/interdict --dependency-update | grep -c 'serviceAccountName:' — confirms all pods use dedicated SA"
  - "helm template interdict helm/interdict --dependency-update | grep -c 'readOnlyRootFilesystem: true' — confirms all containers have read-only rootfs"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Enforce sidecar read-only rootfs and create ServiceAccount

**Hardened sidecar to read-only rootfs with tmpfs, created ServiceAccount with minimal RBAC, wired all pods to dedicated SA**

## What Happened

Two security gaps addressed:

1. **Sidecar read-only rootfs:** Changed `readOnlyRootFilesystem: false` to `true` in `_sidecar-container.tpl`. Added tmpfs-backed `/tmp` volume mount for runtime writable paths. Also added `runAsGroup: 1000` and `capabilities: { drop: [ALL] }` which were missing from the sidecar template (present in standalone deployments but not sidecar). Updated example-app to include the `interdict-tmp` tmpfs volume.

2. **ServiceAccount with RBAC:** Created three new templates:
   - `serviceaccount.yaml` — SA with `automountServiceAccountToken: false` for minimal attack surface
   - `role.yaml` — namespace-scoped Role granting `get`, `list` on `secrets` and `configmaps` only
   - `rolebinding.yaml` — binds Role to SA in release namespace

   Updated `values.yaml` to default `serviceAccount.create: true` with annotations support. Added `serviceAccountName` reference to all 6 pod specs (4 deployments + cert-init Job + minio-init Job) via the existing `interdict.serviceAccountName` helper.

## Verification

All slice-level checks pass (this is the final task):

| Check | Result |
|-------|--------|
| `grep -c "runAsNonRoot: true"` | 6 (≥5 ✓) |
| `grep "readOnlyRootFilesystem" \| grep -c "true"` | 5 (≥5 ✓) |
| `grep -c "kind: ServiceAccount"` | 2 (≥1 ✓, includes subchart SA) |
| `grep -c "kind: Role"` | 3 (≥1 ✓, includes RoleBinding) |
| `helm lint helm/interdict` | 0 chart(s) failed ✓ |
| `bash scripts/quality/infra-check.sh helm/interdict/templates/` | passed ✓ |
| `grep -c "drop:"` | 5 (≥5 ✓) |
| `grep -c "serviceAccountName:"` | 6 (all pods wired ✓) |
| SA conditional guard (create=false → 0 SAs) | 0 ✓ |
| `automountServiceAccountToken: false` present | 1 ✓ |
| With sidecar enabled: `readOnlyRootFilesystem: true` count | 6 ✓ |
| With sidecar enabled: `drop:` count | 6 ✓ |

## Diagnostics

- Inspect rendered RBAC: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -B2 -A15 "kind: Role$"`
- Verify SA wiring: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep "serviceAccountName:"`
- Verify sidecar security (with sidecar enabled): `helm template interdict helm/interdict --dependency-update --set sidecar.enabled=true --set sidecar.exampleApp.enabled=true 2>/dev/null | grep -A15 "name: interdict-kernel" | grep readOnlyRootFilesystem`
- Test SA conditional: `helm template interdict helm/interdict --set serviceAccount.create=false --dependency-update 2>/dev/null | grep -c "kind: ServiceAccount"` should return 0

## Deviations

- Added `runAsGroup: 1000` and `capabilities: { drop: [ALL] }` to sidecar container — these were missing from the original template but present in all standalone deployments. Not in the plan but necessary for consistent security posture.
- Added `serviceAccountName` to minio-init Job and example-app — not explicitly listed in plan but required for consistency.
- Added `configmaps` to Role resources alongside `secrets` — config access is also needed by pods.
- Added `serviceAccount.annotations` field to values.yaml for cloud provider SA binding (e.g., AWS IRSA).

## Known Issues

- `bash scripts/quality/infra-check.sh` (full mode, no args) still fails on pre-existing Dockerfile lint warnings in `docker/control-plane/Dockerfile` (DL3008, DL4006). Unrelated to Helm changes. Pre-dates this slice.

## Files Created/Modified

- `helm/interdict/templates/sidecar/_sidecar-container.tpl` — Changed readOnlyRootFilesystem to true, added runAsGroup, capabilities drop, /tmp tmpfs mount
- `helm/interdict/templates/serviceaccount.yaml` — New: conditional ServiceAccount with automountServiceAccountToken: false
- `helm/interdict/templates/role.yaml` — New: namespace-scoped Role for secrets and configmaps access
- `helm/interdict/templates/rolebinding.yaml` — New: RoleBinding linking SA to Role
- `helm/interdict/values.yaml` — Changed serviceAccount.create to true, added annotations field
- `helm/interdict/templates/kernel/deployment.yaml` — Added serviceAccountName
- `helm/interdict/templates/control-plane/deployment.yaml` — Added serviceAccountName
- `helm/interdict/templates/evidence-collector/deployment.yaml` — Added serviceAccountName
- `helm/interdict/templates/dashboard/deployment.yaml` — Added serviceAccountName
- `helm/interdict/templates/cert-init-job.yaml` — Added serviceAccountName
- `helm/interdict/templates/minio-init-job.yaml` — Added serviceAccountName
- `helm/interdict/templates/sidecar/example-app.yaml` — Added serviceAccountName, interdict-tmp tmpfs volume
- `.gsd/milestones/M008/slices/S05/S05-PLAN.md` — Marked T02 done, added failure-path verification checks
