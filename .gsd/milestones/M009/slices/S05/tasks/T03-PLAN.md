# T03: Helm minio-init and sidecar-init security contexts

## Description

Harden Helm init containers to have complete securityContext matching the sidecar container template pattern. Closes M-08 (minio-init missing fields) and L-15 (sidecar-init missing `drop: [ALL]`).

## Steps

1. Open `helm/interdict/templates/minio-init-job.yaml`. The current securityContext block (lines 61-65) has:
   ```yaml
   securityContext:
     runAsNonRoot: true
     runAsUser: 1000
     runAsGroup: 1000
     allowPrivilegeEscalation: false
   ```
   Add the missing fields to make it complete:
   ```yaml
   securityContext:
     runAsNonRoot: true
     runAsUser: 1000
     runAsGroup: 1000
     allowPrivilegeEscalation: false
     readOnlyRootFilesystem: true
     capabilities:
       drop:
         - ALL
     seccompProfile:
       type: RuntimeDefault
   ```

2. Open `helm/interdict/templates/sidecar/_sidecar-init.tpl`. The current securityContext block (lines 40-43) has:
   ```yaml
   securityContext:
     capabilities:
       add: ["NET_ADMIN"]
     runAsUser: 0
   ```
   Replace with a complete securityContext:
   ```yaml
   securityContext:
     runAsUser: 0
     allowPrivilegeEscalation: false
     capabilities:
       drop:
         - ALL
       add:
         - NET_ADMIN
     seccompProfile:
       type: RuntimeDefault
   ```

   Notes on sidecar-init:
   - `runAsUser: 0` stays — iptables requires root
   - `allowPrivilegeEscalation: false` — NET_ADMIN is granted at container start via the `add` list, not via privilege escalation. This works on standard Kubernetes runtimes.
   - `drop: [ALL]` + `add: [NET_ADMIN]` — drops everything except the one capability needed
   - `readOnlyRootFilesystem` is NOT added here — iptables writes to `/run/xtables.lock` and possibly `/tmp`. Adding it would require tmpfs mounts in the init container spec, which complicates the helper template. The sidecar container (long-running) already has it; the init container (runs once, exits) has less exposure.
   - `runAsNonRoot` is NOT added — would conflict with `runAsUser: 0`

3. Run `helm lint helm/interdict` to validate templates.

4. Run `helm template interdict helm/interdict` and verify:
   - minio-init container shows `readOnlyRootFilesystem: true`, `drop: [ALL]`, and `seccompProfile`
   - sidecar-init container shows `drop: [ALL]`, `add: [NET_ADMIN]`, and `seccompProfile`

## Must-Haves

- minio-init has `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, `seccompProfile: { type: RuntimeDefault }`
- sidecar-init has `capabilities.drop: [ALL]` alongside `add: [NET_ADMIN]`
- sidecar-init has `allowPrivilegeEscalation: false` and `seccompProfile: { type: RuntimeDefault }`
- `helm lint helm/interdict` passes

## Verification

```bash
helm lint helm/interdict
helm template interdict helm/interdict | grep -A 15 "name: minio-init" | grep -c "readOnlyRootFilesystem"
helm template interdict helm/interdict | grep -B2 -A5 "NET_ADMIN"  # should show drop: [ALL] nearby
```

## Inputs

- `helm/interdict/templates/minio-init-job.yaml` lines 61-65: incomplete securityContext
- `helm/interdict/templates/sidecar/_sidecar-init.tpl` lines 40-43: missing `drop: [ALL]` and other fields
- Reference pattern: `helm/interdict/templates/sidecar/_sidecar-container.tpl` lines 84-92

## Observability Impact

These are declarative Helm template changes — no runtime signals change. Inspection surfaces:

- `helm template interdict helm/interdict | grep -A 15 "name: minio-init"` — shows complete securityContext for minio-init
- `helm template interdict helm/interdict | grep -B2 -A10 "NET_ADMIN"` — shows drop/add capabilities and seccompProfile for sidecar-init
- `kubectl describe pod <pod>` — at deploy time, the Pod spec will show the enforced security fields
- Kubernetes admission controllers (OPA/Gatekeeper, Kyverno) that require `drop: [ALL]` or `seccompProfile` will now pass these init containers

Failure shape: if capabilities are misconfigured, the init container will fail at runtime with a permission-denied error in pod events (`kubectl describe pod`).

## Expected Output

- Both init containers have complete securityContext blocks
- `helm lint` passes
- `helm template` output shows expected fields on both containers
