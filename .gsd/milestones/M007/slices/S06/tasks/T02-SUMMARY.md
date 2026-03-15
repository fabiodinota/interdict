---
id: T02
parent: S06
milestone: M007
provides:
  - All 4 Helm NetworkPolicy resources enabled by default for zero-trust pod-to-pod communication
  - CNI requirement documentation on each networkPolicy toggle
key_files:
  - helm/interdict/values.yaml
key_decisions:
  - Network policies enabled by default with operator escape hatch via per-service `networkPolicy.enabled: false`
patterns_established:
  - YAML inline comment documenting infrastructure prerequisites (CNI) at the toggle point
observability_surfaces:
  - "`helm template interdict helm/interdict --dependency-update | grep -c 'kind: NetworkPolicy'` — returns 4"
  - "`kubectl get networkpolicy -n <namespace>` — shows 4 policies at runtime"
  - "Pod-to-pod traffic blocked if CNI lacks NetworkPolicy support — visible as connection refused in `kubectl logs`"
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Enable Helm network policies by default

**Flipped `networkPolicy.enabled` to `true` for all 4 services (kernel, controlPlane, evidenceCollector, dashboard) with CNI requirement comments**

## What Happened

Changed `networkPolicy.enabled` from `false` to `true` for kernel, controlPlane, evidenceCollector, and dashboard in `helm/interdict/values.yaml`. Added a standardized comment above each toggle: `# Requires CNI with NetworkPolicy support (Calico, Cilium, etc). Set false if unsupported.`

The NetworkPolicy templates already existed with correct ingress/egress rules for each service — this change simply activates them by default, completing zero-trust pod-to-pod communication for the Helm deployment.

## Verification

- `grep -n "networkPolicy:" -A1 helm/interdict/values.yaml` — all 4 entries show `enabled: true` (lines 84, 157, 226, 268) ✓
- `grep -c "enabled: true" helm/interdict/values.yaml` — increased from 9 to 13 (+4) ✓
- `grep -c "Requires CNI" helm/interdict/values.yaml` — returns 4 ✓
- `helm template interdict helm/interdict --dependency-update | grep -c "kind: NetworkPolicy"` — returns 4 ✓

### Slice-level verification (partial — T02 scope):
- ✅ `helm template interdict helm/interdict` — renders all 4 network policies
- ⏳ `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — T01 scope (already passed)
- ⏳ `cd dashboard && npx next build` — T01 scope (already passed)
- ⏳ `cargo build -p kernel -p evidence-collector` — T03 scope (not yet)
- ⏳ `grep -c "unsafe-inline" dashboard/src/proxy.ts` — T01 scope (already passed)
- ⏳ `grep -c "x-nonce" dashboard/src/app/layout.tsx` — T01 scope (already passed)

## Diagnostics

- `helm template interdict helm/interdict --dependency-update | grep "kind: NetworkPolicy"` — renders 4 NetworkPolicy manifests
- `kubectl get networkpolicy -n <namespace>` — shows active policies at runtime
- If pod-to-pod traffic is blocked unexpectedly, check CNI supports NetworkPolicy; set `<service>.networkPolicy.enabled=false` as escape hatch
- Note: `helm template` requires `--dependency-update` on Helm v4.x with OCI-based subchart dependencies; the `.tgz` files in `charts/` may not be recognized without it

## Deviations

- `helm template` required `--dependency-update` flag due to Helm v4.x behavior with OCI subchart dependencies — the `.tgz` files existed in `charts/` but Helm's dependency check didn't recognize them without re-running the update. This is a local toolchain quirk, not a chart issue.

## Known Issues

None

## Files Created/Modified

- `helm/interdict/values.yaml` — flipped 4 `networkPolicy.enabled` from `false` to `true`, added CNI requirement comments
- `.gsd/milestones/M007/slices/S06/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
