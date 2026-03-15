# T01: Harden cert-init Job securityContext

**Why:** M-09 — cert-init runs as root with no security restrictions, inconsistent with all other pods.

**Files:** `helm/interdict/templates/cert-init-job.yaml`

## Steps

1. Add pod-level `securityContext` with `fsGroup: 1000` and `seccompProfile: RuntimeDefault`
2. Add container-level `securityContext`: `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup: 1000`, `allowPrivilegeEscalation: false`, `capabilities: { drop: [ALL] }`, `readOnlyRootFilesystem: true`
3. Add tmpfs emptyDir volume for `/tmp` (cert generation writes temp CSR/ext files there)
4. Modify command to install openssl to tmpfs via `apk --root /tmp/apkroot` to avoid rootfs writes
5. Verify: `helm template` shows cert-init with `runAsNonRoot: true`, `helm lint` passes

## Verify

- `helm template interdict helm/interdict --dependency-update | grep -A 50 "kind: Job" | grep "runAsNonRoot: true"` — shows cert-init security context
- `helm lint helm/interdict` passes
