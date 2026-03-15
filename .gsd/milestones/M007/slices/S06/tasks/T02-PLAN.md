---
estimated_steps: 2
estimated_files: 1
---

# T02: Enable Helm network policies by default

**Slice:** S06 — Security & CSP Hardening
**Milestone:** M007

## Description

Flip `networkPolicy.enabled` from `false` to `true` for all four services (kernel, controlPlane, evidenceCollector, dashboard) in `helm/interdict/values.yaml`. The NetworkPolicy templates already exist with correct ingress/egress rules — this change activates them by default for zero-trust pod-to-pod communication. Add a YAML comment documenting the CNI requirement and how operators can disable if needed.

## Steps

1. In `helm/interdict/values.yaml`, change each `networkPolicy.enabled: false` to `networkPolicy.enabled: true` for:
   - kernel (line ~86)
   - controlPlane (line ~158)
   - evidenceCollector (line ~226)
   - dashboard (line ~268)
   Add a comment above each: `# Requires CNI with NetworkPolicy support (Calico, Cilium, etc). Set false if unsupported.`

2. Verify with `helm template interdict helm/interdict | grep -c "kind: NetworkPolicy"` — expect 4

## Must-Haves

- [ ] All 4 `networkPolicy.enabled` set to `true`
- [ ] Comment documenting CNI requirement on each
- [ ] `helm template` renders 4 NetworkPolicy resources

## Verification

- `helm template interdict helm/interdict | grep -c "kind: NetworkPolicy"` returns 4
- `grep -c "enabled: true" helm/interdict/values.yaml` shows increase (4 more than before)

## Inputs

- `helm/interdict/values.yaml` — current file with 4 `networkPolicy.enabled: false` entries
- S06-RESEARCH.md — confirmation that policies are already well-designed with correct rules

## Observability Impact

- **Inspection surface:** `helm template interdict helm/interdict | grep -c "kind: NetworkPolicy"` — returns 4 when enabled (0 when disabled). Operators can verify active policies with `kubectl get networkpolicy -n <namespace>`.
- **Failure visibility:** If the cluster CNI does not support NetworkPolicy (e.g., Flannel without policy plugin), policies are silently ignored — pods communicate freely. Misconfig blocks pod-to-pod traffic; visible in `kubectl logs` as connection refused / timeout errors between services.
- **Operator toggle:** Each service's `networkPolicy.enabled` can be set to `false` via `--set kernel.networkPolicy.enabled=false` (etc.) for clusters without CNI policy support.

## Expected Output

- `helm/interdict/values.yaml` — 4 network policies enabled with CNI documentation comments
