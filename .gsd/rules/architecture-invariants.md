# Architecture Invariants

These constraints apply to all code changes, regardless of phase.

## Plane Separation

- Data plane (kernel) executes inline enforcement only; no direct DB writes in the hot path.
- Control plane compiles/distributes policy and serves administration workflows.

## Runtime and Performance

- Hot-path code remains Rust; do not shift request interception to Python/JS.
- Keep streaming-first flows; avoid full buffering of model responses.
- Preserve bounded queues/channels and explicit backpressure behavior.

## Enforcement Semantics

- Fail-closed defaults for high-risk profiles.
- Deterministic policy logic only in enforcement path.
- Request and response inspection must support redaction and hard block/sever actions.

## Deployability

- Changes must stay compatible with VPC-native, sidecar, and air-gapped deployment models.
- Do not introduce cloud-only dependencies into enforcement-critical paths.
