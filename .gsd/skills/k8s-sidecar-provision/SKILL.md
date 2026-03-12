---
name: k8s-sidecar-provision
description: Prepare and validate Kubernetes sidecar deployment assets for Interdict.
---

# /k8s-sidecar-provision

Use this skill when adding or modifying Kubernetes deployment assets.

## Steps

1. Validate sidecar container contract (ports, probes, cert mounts, resource limits).
2. Confirm network policy assumptions and egress restrictions are explicit.
3. Verify deployment still supports fail-closed behavior when policy/data paths fail.
4. Generate or update Helm values/manifests with security defaults.

## Verification

- `helm lint` for charts when present
- kind-based smoke test for sidecar startup and health checks
- policy enforcement smoke test in sidecar mode

## Output

- Updated manifest/chart file list
- Security defaults confirmed
- Known gaps and operator setup notes
