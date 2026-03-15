---
id: S05
milestone: M008
status: ready
---

# S05: Helm Security Hardening — Context

## Goal

Harden cert-init Job with securityContext, enforce read-only rootfs on sidecar, create ServiceAccount with RBAC, and address cert PVC access mode — closing M-09, M-10, and related Helm findings.

## Why this Slice

The cert-init Job runs as root with no security restrictions (M-09), the sidecar has writable rootfs (M-10), and no dedicated ServiceAccount exists. These are inconsistencies with the otherwise thorough pod security posture (all standalone deployments have full securityContext).

## Scope

### In Scope

- securityContext on cert-init Job (runAsNonRoot, capabilities drop, seccomp, readOnlyRootFilesystem)
- Sidecar template `readOnlyRootFilesystem: true`
- ServiceAccount creation with `serviceAccount.create: true` by default
- Role/RoleBinding for minimal RBAC (get/list secrets for cert access)
- Cert PVC access mode consideration for multi-node (ReadWriteMany if feasible, documented limitation if not)

### Out of Scope

- Changing cert generation logic
- Adding new Helm templates beyond ServiceAccount/Role/RoleBinding
- Cluster-level RBAC

## Constraints

- cert-init needs write access to the cert volume (but not rootfs)
- Sidecar needs tmpfs for runtime files if rootfs is read-only
- ServiceAccount RBAC must be namespace-scoped, not cluster-scoped

## Integration Points

### Consumes

- `helm/interdict/templates/cert-init-job.yaml`
- `helm/interdict/templates/sidecar/_sidecar-container.tpl`
- `helm/interdict/values.yaml`

### Produces

- Hardened cert-init Job with full securityContext
- Read-only rootfs sidecar template
- ServiceAccount, Role, and RoleBinding templates
- Updated values.yaml with serviceAccount.create default
