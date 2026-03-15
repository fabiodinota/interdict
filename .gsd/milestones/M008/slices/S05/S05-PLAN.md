# S05: Helm Security Hardening

**Goal:** Harden cert-init securityContext, enforce sidecar read-only rootfs, create ServiceAccount with RBAC.
**Demo:** `helm template interdict helm/interdict --dependency-update | grep -A5 "cert-init" | grep "runAsNonRoot"` shows security context. Sidecar shows `readOnlyRootFilesystem: true`. ServiceAccount manifest exists. `bash scripts/quality/infra-check.sh` passes.

## Must-Haves

- cert-init Job has `securityContext` with `runAsNonRoot: true`, `runAsUser: 1000`, `capabilities: drop: [ALL]`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`
- cert-init Job has `readOnlyRootFilesystem: true` with tmpfs for `/tmp` and cert volume mounted as writable
- Sidecar template changes `readOnlyRootFilesystem: false` to `true` with tmpfs for necessary writable paths
- ServiceAccount created by default with namespace-scoped Role and RoleBinding
- All Helm changes pass kube-score validation

## Verification

- `helm template interdict helm/interdict --dependency-update | grep -c "runAsNonRoot: true"` returns ≥5 (4 deployments + cert-init)
- `helm template interdict helm/interdict --dependency-update | grep "readOnlyRootFilesystem" | grep -c "true"` ≥5
- `helm template interdict helm/interdict --dependency-update | grep -c "kind: ServiceAccount"` returns ≥1
- `helm template interdict helm/interdict --dependency-update | grep -c "kind: Role"` returns ≥1
- `bash scripts/quality/infra-check.sh` passes
- `helm lint helm/interdict` passes

## Tasks

- [ ] **T01: Harden cert-init Job securityContext** `est:30m`
  - Why: M-09 — cert-init runs as root with no security restrictions, inconsistent with all other pods.
  - Files: `helm/interdict/templates/cert-init-job.yaml`
  - Do: Add `securityContext` to the container spec matching other pods: `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup: 1000`, `allowPrivilegeEscalation: false`, `capabilities: { drop: [ALL] }`, `seccompProfile: { type: RuntimeDefault }`, `readOnlyRootFilesystem: true`. Add `volumeMounts` for `/tmp` as tmpfs (cert generation needs a temp directory). The cert volume mount at `/certs` remains writable. Update the Alpine image to use a non-root user — add `USER 1000` equivalent or use `securityContext` to enforce. Verify the openssl/cert generation commands work as non-root (they write to the mounted volume, not rootfs).
  - Verify: `helm template` shows cert-init with `runAsNonRoot: true`. `helm lint helm/interdict` passes.
  - Done when: cert-init has identical security posture to standalone deployments.

- [ ] **T02: Enforce sidecar read-only rootfs and create ServiceAccount** `est:30m`
  - Why: M-10 — Sidecar has writable rootfs, inconsistent with standalone deployments. L-05 — No dedicated ServiceAccount.
  - Files: `helm/interdict/templates/sidecar/_sidecar-container.tpl`, `helm/interdict/values.yaml`, `helm/interdict/templates/serviceaccount.yaml` (new), `helm/interdict/templates/role.yaml` (new), `helm/interdict/templates/rolebinding.yaml` (new)
  - Do: In `_sidecar-container.tpl`, change `readOnlyRootFilesystem: false` to `true`. Add tmpfs volume mounts for writable paths the kernel needs at runtime (e.g., `/tmp` for config templating). Create `templates/serviceaccount.yaml` with `{{ if .Values.serviceAccount.create }}` guard. Create `templates/role.yaml` with namespace-scoped Role allowing `get`, `list` on `secrets` (for cert access). Create `templates/rolebinding.yaml` binding the Role to the ServiceAccount. In `values.yaml`, set `serviceAccount.create: true` and `serviceAccount.name: ""` (auto-generates from fullname). Update all deployment templates to reference `{{ include "interdict.serviceAccountName" . }}`.
  - Verify: `helm template` shows ServiceAccount, Role, RoleBinding. Sidecar shows `readOnlyRootFilesystem: true`. `helm lint` passes. `bash scripts/quality/infra-check.sh` passes.
  - Done when: Sidecar has read-only rootfs, ServiceAccount exists with minimal RBAC.

## Files Likely Touched

- `helm/interdict/templates/cert-init-job.yaml`
- `helm/interdict/templates/sidecar/_sidecar-container.tpl`
- `helm/interdict/templates/serviceaccount.yaml` (new)
- `helm/interdict/templates/role.yaml` (new)
- `helm/interdict/templates/rolebinding.yaml` (new)
- `helm/interdict/values.yaml`
- `helm/interdict/templates/_helpers.tpl`
- `helm/interdict/templates/kernel/deployment.yaml`
- `helm/interdict/templates/control-plane/deployment.yaml`
- `helm/interdict/templates/evidence-collector/deployment.yaml`
- `helm/interdict/templates/dashboard/deployment.yaml`
