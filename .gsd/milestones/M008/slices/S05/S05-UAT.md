# S05: Helm Security Hardening — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are Helm template modifications verifiable by `helm template` output inspection without a live cluster.

## Preconditions

- Helm v3 installed locally
- Working directory is the repository root
- No live Kubernetes cluster required — all tests use `helm template` for offline rendering

## Smoke Test

```bash
helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -c "runAsNonRoot: true"
```
Expected: ≥5 (confirms security contexts are rendering)

## Test Cases

### 1. Cert-init Job has full container securityContext

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -A 50 "kind: Job" | head -70`
2. **Expected:** The cert-init Job container spec includes:
   - `runAsNonRoot: true`
   - `runAsUser: 1000`
   - `runAsGroup: 1000`
   - `allowPrivilegeEscalation: false`
   - `readOnlyRootFilesystem: true`
   - `capabilities: { drop: [ALL] }`

### 2. Cert-init Job has pod-level securityContext

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -A 50 "kind: Job" | grep -A3 "securityContext"`
2. **Expected:** Pod-level `securityContext` includes `fsGroup: 1000` and `seccompProfile: type: RuntimeDefault`

### 3. Cert-init has tmpfs volume for /tmp

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -A 50 "kind: Job" | grep -A5 "emptyDir"`
2. **Expected:** A volume with `emptyDir: { medium: Memory, sizeLimit: 16Mi }` exists, mounted at `/tmp`

### 4. Sidecar enforces read-only rootfs

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep "readOnlyRootFilesystem" | grep -c "true"`
2. **Expected:** ≥5 (4 deployments + cert-init; sidecar adds more when enabled)

### 5. Sidecar has complete security restrictions

1. Run: `helm template interdict helm/interdict --set sidecar.enabled=true --set sidecar.exampleApp.enabled=true --dependency-update 2>/dev/null | grep -A15 "name: interdict-kernel" | grep -E "runAsGroup|drop|readOnly"`
2. **Expected:** Sidecar container shows `runAsGroup: 1000`, `drop: [ALL]`, and `readOnlyRootFilesystem: true`

### 6. ServiceAccount is created by default

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -c "kind: ServiceAccount"`
2. **Expected:** ≥1 (our SA plus any subchart SAs)

### 7. ServiceAccount has automountServiceAccountToken disabled

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep "automountServiceAccountToken" | grep -c "false"`
2. **Expected:** ≥1

### 8. Role exists with minimal permissions

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -B2 -A15 "kind: Role$"`
2. **Expected:** A Role manifest with:
   - `apiGroups: [""]`
   - `resources: ["secrets", "configmaps"]`
   - `verbs: ["get", "list"]`

### 9. RoleBinding connects ServiceAccount to Role

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -B2 -A15 "kind: RoleBinding"`
2. **Expected:** A RoleBinding referencing the SA and Role by name

### 10. All pods reference the ServiceAccount

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -c "serviceAccountName:"`
2. **Expected:** ≥6 (kernel, control-plane, evidence-collector, dashboard, cert-init, minio-init)

### 11. All containers drop Linux capabilities

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -c "drop:"`
2. **Expected:** ≥5

### 12. Helm lint passes

1. Run: `helm lint helm/interdict`
2. **Expected:** `0 chart(s) failed` (warnings about missing subchart dependencies are acceptable)

### 13. Infra quality check passes

1. Run: `bash scripts/quality/infra-check.sh helm/interdict/templates/`
2. **Expected:** `Infra quality checks completed successfully.`

## Edge Cases

### ServiceAccount conditional guard — create=false

1. Run: `helm template interdict helm/interdict --set serviceAccount.create=false --dependency-update 2>/dev/null | grep -c "kind: ServiceAccount"`
2. **Expected:** 0 (no ServiceAccount manifest emitted when disabled)

### ServiceAccount conditional guard — custom name

1. Run: `helm template interdict helm/interdict --set serviceAccount.name=custom-sa --dependency-update 2>/dev/null | grep "serviceAccountName:" | head -1`
2. **Expected:** `serviceAccountName: custom-sa`

### No CRLF characters in rendered output

1. Run: `helm template interdict helm/interdict --dependency-update 2>/dev/null | cat -A | grep -c $'\r'`
2. **Expected:** 0 (no carriage return characters in rendered manifests)

## Failure Signals

- `helm template` showing `readOnlyRootFilesystem: false` on any container
- `grep -c "runAsNonRoot: true"` returning <5
- `grep -c "drop:"` returning <5 — indicates a container retains Linux capabilities
- `helm lint` reporting chart failures (not warnings)
- Missing `serviceAccountName:` on any pod spec
- `\r` characters appearing in rendered output (CRLF regression)

## Requirements Proved By This UAT

- AR-HELM-01 — Cert-init Job has full securityContext, sidecar enforces read-only rootfs, ServiceAccount created with RBAC, all pods reference dedicated SA

## Not Proven By This UAT

- Runtime behavior of cert generation under non-root user — requires a live Kubernetes cluster
- RBAC permissions actually working for secret/configmap access — requires a live cluster with RBAC enabled
- kube-score validation — not installed locally, verified in CI

## Notes for Tester

- The `--dependency-update` flag may pull subchart dependencies on first run, adding ~10 seconds.
- Subchart ServiceAccounts (e.g., from PostgreSQL bitnami chart) contribute to ServiceAccount counts but are not part of our security hardening.
- `helm lint` may show `[WARNING]` about missing subchart dependencies — this is expected and not a failure.
- The infra-check.sh script in targeted mode (with path argument) passes cleanly. Full mode (no args) has pre-existing Dockerfile issues unrelated to this slice.
