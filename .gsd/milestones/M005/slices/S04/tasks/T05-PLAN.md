# T05: 33-warning-burndown-next16-project-truth 05

**Slice:** S04 — **Milestone:** M005

## Description

Close the remaining infra gate failure by making the two existing protobuf contracts Buf-compliant and wiring every in-repo consumer to the renamed truth.

Purpose: finish the last unclosed `HR-MAINT-01` infra gap so `npm run lint:infra` passes without resorting to an unexplained repo-wide Buf suppression.
Output: renamed evidence and policy distribution protobuf contracts plus aligned Rust and TypeScript consumers.

## Must-Haves

- [ ] `npm run lint:infra` no longer fails on raw Buf naming violations in the evidence and policy distribution protos.
- [ ] Evidence and policy distribution gRPC consumers compile against the renamed contracts without changing the underlying streaming semantics.
- [ ] Any enum renumbering required for Buf zero-value rules is applied consistently across control-plane and kernel code, so the repo moves from warning debt to one coherent proto truth.

## Files

- `buf.yaml`
- `proto/interdict/evidence/v1/evidence.proto`
- `proto/interdict/policy/v1/policy_distribution.proto`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/evidence-collector/src/main.rs`
- `crates/kernel/src/evidence/client.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `crates/kernel/src/policy/distribution/snapshot.rs`
- `crates/kernel/tests/distribution_test.rs`
- `control-plane/src/modules/distribution/index.ts`
- `control-plane/src/modules/distribution/server.ts`
- `control-plane/src/modules/distribution/tracker.ts`
- `control-plane/src/modules/compiler/worker.ts`
