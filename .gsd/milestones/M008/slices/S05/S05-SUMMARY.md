---
id: S05
parent: M008
milestone: M008
provides:
  - Cert-init Job hardened with full securityContext and readOnlyRootFilesystem
  - Sidecar template enforces read-only rootfs with tmpfs for /tmp
  - ServiceAccount with namespace-scoped RBAC for secrets and configmaps
  - All pods and jobs reference dedicated ServiceAccount
  - CRLF line endings fixed in 14 Helm template files
requires: []
affects:
  - S08
key_files:
  - helm/interdict/templates/cert-init-job.yaml
  - helm/interdict/templates/sidecar/_sidecar-container.tpl
  - helm/interdict/templates/serviceaccount.yaml
  - helm/interdict/templates/role.yaml
  - helm/interdict/templates/rolebinding.yaml
  - helm/interdict/values.yaml
key_decisions:
  - "D053: apk --root /tmp/apkroot for readOnlyRootFilesystem init containers"
  - "D054: ServiceAccount with automountServiceAccountToken: false by default"
patterns_established:
  - tmpfs emptyDir with Memory medium and sizeLimit for init containers needing temp writable paths
  - All pod specs reference serviceAccountName via interdict.serviceAccountName helper
  - ServiceAccount guarded by values.serviceAccount.create conditional
observability_surfaces:
  - "helm template interdict helm/interdict --dependency-update | grep -c 'runAsNonRoot: true' — confirms all containers run non-root"
  - "helm template interdict helm/interdict --dependency-update | grep -c 'readOnlyRootFilesystem: true' — confirms read-only rootfs"
  - "helm template interdict helm/interdict --dependency-update | grep -c 'serviceAccountName:' — confirms all pods use dedicated SA"
drill_down_paths:
  - .gsd/milestones/M008/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S05/tasks/T02-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-15
---

# S05: Helm Security Hardening

**Hardened cert-init Job and sidecar with full securityContext, read-only rootfs, and created ServiceAccount with minimal RBAC — all pods now have consistent security posture**

## What Happened

Two tasks closed three assessment findings (M-09, M-10, L-05) by bringing Helm chart security to parity with standalone deployments.

**T01 — Cert-init Job securityContext:** The cert-init Job ran as root with no security restrictions. Added pod-level securityContext (`fsGroup: 1000`, `seccompProfile: RuntimeDefault`) and container-level (`runAsNonRoot: true`, `runAsUser/Group: 1000`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`). The key challenge was running `apk add openssl` with a read-only rootfs — solved by installing to a tmpfs-backed alternate root (`apk --root /tmp/apkroot --initdb`) and prepending that to PATH. The `/tmp` tmpfs (16Mi Memory-backed emptyDir) also serves openssl temp files during cert generation.

**T02 — Sidecar read-only rootfs & ServiceAccount:** Changed sidecar `readOnlyRootFilesystem` from `false` to `true`, added tmpfs for `/tmp`, and filled in missing `runAsGroup: 1000` and `capabilities: { drop: [ALL] }`. Created ServiceAccount with `automountServiceAccountToken: false`, a namespace-scoped Role granting `get`/`list` on `secrets` and `configmaps` only, and a RoleBinding. Updated all 6 pod specs (4 deployments + cert-init + minio-init) to reference the SA via the `interdict.serviceAccountName` helper.

**CRLF fix (discovered during verification):** 14 Helm template files had Windows CRLF line endings that injected `\r` into `helm template` output, causing grep-based verification commands to fail. Converted all to LF for consistent rendering.

## Verification

All 9 slice-level checks pass:

| Check | Expected | Actual |
|-------|----------|--------|
| `runAsNonRoot: true` count | ≥5 | 6 ✓ |
| `readOnlyRootFilesystem: true` count | ≥5 | 5 ✓ |
| `kind: ServiceAccount` count | ≥1 | 2 ✓ |
| `kind: Role` count | ≥1 | 3 ✓ |
| `helm lint helm/interdict` | 0 failed | 0 failed ✓ |
| `infra-check.sh helm/interdict/templates/` | passes | passes ✓ |
| `drop:` count | ≥5 | 5 ✓ |
| SA conditional (create=false → 0 SAs) | 0 | 0 ✓ |
| `automountServiceAccountToken: false` | ≥1 | 1 ✓ |

## Requirements Advanced

- AR-HELM-01 — Cert-init Job has full securityContext, sidecar enforces read-only rootfs, ServiceAccount created with minimal RBAC

## Requirements Validated

- AR-HELM-01 — All 9 verification checks pass: security contexts on all containers, ServiceAccount with RBAC, conditional guards, helm lint clean

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Fixed CRLF line endings in 14 Helm template files — not in the plan but discovered during verification when grep commands failed due to `\r` characters in rendered output.
- Added `runAsGroup: 1000` and `capabilities: { drop: [ALL] }` to sidecar container — not in plan but necessary for consistency with standalone deployments.
- Added `configmaps` to Role resources alongside `secrets` — pods also need config access.
- Added `serviceAccountName` to minio-init Job and example-app — not explicitly listed but required for consistency.

## Known Limitations

- `bash scripts/quality/infra-check.sh` (full mode, no args) fails on pre-existing Dockerfile lint warnings in `docker/control-plane/Dockerfile` (DL3008, DL4006). Unrelated to Helm changes and pre-dates this slice. Targeted mode (passing template path) passes cleanly.
- kube-score not installed in local dev environment — skipped during infra-check. CI has it pinned.

## Follow-ups

- none

## Files Created/Modified

- `helm/interdict/templates/cert-init-job.yaml` — Added pod-level and container-level securityContext, tmpfs volume for /tmp, modified command for tmpfs-based openssl install; fixed CRLF line endings
- `helm/interdict/templates/sidecar/_sidecar-container.tpl` — Changed readOnlyRootFilesystem to true, added runAsGroup, capabilities drop, /tmp tmpfs mount; fixed CRLF
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
- 14 Helm template files — Fixed CRLF → LF line endings

## Forward Intelligence

### What the next slice should know
- All Helm templates now render cleanly without `\r` characters. Verification commands using `grep` on `helm template` output work without `tr -d '\r'` workarounds.
- ServiceAccount is wired to all pods — any new deployment templates must include `serviceAccountName: {{ include "interdict.serviceAccountName" . }}`.

### What's fragile
- The `apk --root /tmp/apkroot` technique for cert-init depends on Alpine's apk supporting alternate root installation. If the base image changes away from Alpine, the cert-init command will need rework.
- `bash scripts/quality/infra-check.sh` in full mode still fails due to pre-existing Dockerfile issues (DL3008, DL4006 in control-plane Dockerfile). This should be addressed in a future cleanup.

### Authoritative diagnostics
- `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -A 50 "kind: Job"` — shows cert-init security posture in full
- `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -B2 -A15 "kind: Role$"` — shows RBAC configuration

### What assumptions changed
- Assumed all Helm templates had consistent LF line endings — actually 14 files had CRLF, causing silent verification failures. Fixed as part of this slice.
