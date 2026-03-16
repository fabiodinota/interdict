---
id: T03
parent: S05
milestone: M009
provides:
  - Complete securityContext on minio-init (readOnlyRootFilesystem, drop ALL, seccompProfile)
  - Complete securityContext on sidecar-init (drop ALL + add NET_ADMIN, allowPrivilegeEscalation false, seccompProfile)
key_files:
  - helm/interdict/templates/minio-init-job.yaml
  - helm/interdict/templates/sidecar/_sidecar-init.tpl
key_decisions: []
patterns_established: []
observability_surfaces:
  - "`helm template` output shows complete securityContext on both init containers"
  - "`helm lint` validates templates with updated blocks"
  - "Kubernetes admission controllers (OPA/Gatekeeper, Kyverno) requiring drop ALL or seccompProfile will now pass these init containers"
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Helm minio-init and sidecar-init security contexts

**Hardened both Helm init containers with complete securityContext blocks — minio-init gains readOnlyRootFilesystem, drop ALL, and seccompProfile; sidecar-init gains drop ALL alongside NET_ADMIN add, allowPrivilegeEscalation false, and seccompProfile.**

## What Happened

Added missing security fields to two Helm init container templates:

1. **minio-init** (`minio-init-job.yaml`): Appended `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, and `seccompProfile: { type: RuntimeDefault }` to the existing security context that already had `runAsNonRoot`, `runAsUser/Group: 1000`, and `allowPrivilegeEscalation: false`.

2. **sidecar-init** (`_sidecar-init.tpl`): Restructured the security context from just `capabilities.add: ["NET_ADMIN"]` + `runAsUser: 0` to a complete block with `drop: [ALL]` + `add: [NET_ADMIN]`, `allowPrivilegeEscalation: false`, and `seccompProfile: { type: RuntimeDefault }`. Deliberately omitted `readOnlyRootFilesystem` (iptables writes to `/run/xtables.lock`) and `runAsNonRoot` (conflicts with required `runAsUser: 0`).

Also added `## Observability Impact` section to the task plan per pre-flight requirement.

## Verification

- `helm lint helm/interdict` — **passed** (0 failures, expected warnings for optional deps)
- `helm template interdict . --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — minio-init output shows `readOnlyRootFilesystem: true`, `drop: [ALL]`, `seccompProfile.type: RuntimeDefault` ✅
- `helm template` with `sidecar.exampleApp.enabled=true` and `sidecar.trafficRedirect.enabled=true` — sidecar-init (interdict-iptables) output shows `drop: [ALL]`, `add: [NET_ADMIN]`, `allowPrivilegeEscalation: false`, `seccompProfile.type: RuntimeDefault` ✅

### Slice-level verification (partial — T03 of 5):

| Check | Status |
|-------|--------|
| `helm lint helm/interdict` passes | ✅ |
| `grep -c "10-year" docker/certs/generate-internal-ca.sh` returns 0 | ✅ (T01) |
| `docker compose config` cert-init hardened | ✅ (T02) |
| `cargo clippy --workspace` with unsafe_code deny | not run (T01 verified) |
| CI workflow SHA256 verification | pending (T04) |

## Diagnostics

- `helm template interdict helm/interdict --dependency-update --set ... | grep -A 40 "name: minio-init"` — shows full minio-init security context
- `helm template interdict helm/interdict --dependency-update --set ... --set sidecar.exampleApp.enabled=true --set sidecar.trafficRedirect.enabled=true | grep -B3 -A20 "interdict-iptables"` — shows full sidecar-init security context
- Note: `helm template` requires `--dependency-update` flag on this project due to Helm v4 worktree path handling on Windows — dependencies show `ok` but template fails without this flag

## Deviations

None — both edits matched the plan exactly.

## Known Issues

- Helm v4.1.1 on Windows with git worktrees: `helm template` consistently fails with "missing in charts/ directory" even when deps are built and `helm dependency list` shows `ok`. The `--dependency-update` flag works around this by re-fetching deps inline. Not a code issue — appears to be a Helm bug with Windows path resolution in worktrees.

## Files Created/Modified

- `helm/interdict/templates/minio-init-job.yaml` — Added readOnlyRootFilesystem, capabilities.drop ALL, seccompProfile to minio-init securityContext
- `helm/interdict/templates/sidecar/_sidecar-init.tpl` — Restructured securityContext with drop ALL + add NET_ADMIN, allowPrivilegeEscalation false, seccompProfile
- `.gsd/milestones/M009/slices/S05/tasks/T03-PLAN.md` — Added Observability Impact section per pre-flight requirement
