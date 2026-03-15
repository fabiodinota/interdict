# Interdict — gRPC API Reference

> **Services:** 2 gRPC services across 2 proto packages
>
> **Proto files:** [`proto/interdict/evidence/v1/evidence.proto`](../../proto/interdict/evidence/v1/evidence.proto),
> [`proto/interdict/policy/v1/policy_distribution.proto`](../../proto/interdict/policy/v1/policy_distribution.proto)

---

## Table of Contents

- [EvidenceCollectorService](#evidencecollectorservice)
- [PolicyDistributionService](#policydistributionservice)
- [Connection Details](#connection-details)
- [Related Documentation](#related-documentation)

---

## EvidenceCollectorService

**Package:** `interdict.evidence.v1`
**Proto file:** `proto/interdict/evidence/v1/evidence.proto`
**Default port:** `50051` (set via `COLLECTOR_GRPC_LISTEN_ADDR`, default `[::]:50051`)
**Component:** Evidence Collector (Rust)

Receives evidence bundles from kernel instances via client-streaming gRPC. The kernel batches evidence payloads and streams them to the collector, which persists them to ClickHouse and anchors Merkle roots.

### RPCs

| RPC | Type | Request | Response |
|-----|------|---------|----------|
| `SubmitEvidence` | Client-streaming | `stream SubmitEvidenceRequest` | `SubmitEvidenceResponse` |

### SubmitEvidence

Client-streaming RPC. The kernel streams one or more `SubmitEvidenceRequest` messages containing compressed evidence payloads. The collector processes all streamed messages and returns a single summary response.

**Flow:**
1. Kernel opens stream and sends multiple `SubmitEvidenceRequest` messages
2. Each message contains a compressed batch of `EvidenceBundle` records
3. Collector decompresses, validates, and persists each batch
4. When the kernel closes the send side, the collector returns `SubmitEvidenceResponse`

### Messages

#### SubmitEvidenceRequest

Sent by the kernel (client) as part of the streaming call.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `compressed_payload` | `bytes` | 1 | Compressed batch of serialized `EvidenceBundle` records |
| `kernel_id` | `string` | 2 | Unique identifier of the sending kernel instance |
| `batch_sequence` | `uint64` | 3 | Monotonic sequence number for ordering batches within a stream |

#### SubmitEvidenceResponse

Returned once after the client closes the stream.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `accepted_count` | `uint64` | 1 | Number of evidence bundles successfully persisted |
| `rejected_count` | `uint64` | 2 | Number of evidence bundles rejected (validation failures) |
| `error_message` | `string` | 3 | Error description if the entire batch failed (empty on success) |

#### EvidenceBundle

The canonical evidence record. Serialized and compressed inside `SubmitEvidenceRequest.compressed_payload`.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `bundle_id` | `string` | 1 | Unique identifier for this evidence bundle |
| `kernel_id` | `string` | 2 | Kernel instance that produced this bundle |
| `timestamp` | `google.protobuf.Timestamp` | 3 | When the LLM interaction occurred |
| `actor_identity` | `string` | 4 | Identity of the user who initiated the request |
| `department` | `string` | 5 | Department of the actor |
| `vendor` | `string` | 6 | LLM vendor name (e.g., `openai`, `anthropic`) |
| `model` | `string` | 7 | Model identifier (e.g., `gpt-4o`) |
| `prompt_hash` | `string` | 8 | SHA-256 hash of the prompt text |
| `response_hash` | `string` | 9 | SHA-256 hash of the response text |
| `prompt_text` | `string` | 10 | Full prompt text (may be redacted by policy) |
| `response_text` | `string` | 11 | Full response text (may be redacted by policy) |
| `policy_action` | `string` | 12 | Enforcement decision: `allow`, `block`, or `redact` |
| `policy_rules_json` | `string` | 13 | JSON array of policy rules that were evaluated |
| `token_count` | `uint32` | 14 | Total token count for the interaction |
| `enforcement_latency_us` | `uint64` | 15 | Policy enforcement latency in microseconds |
| `chain_hash` | `bytes` | 16 | Tamper-evident hash chaining this bundle to the sequence |
| `previous_hash` | `bytes` | 17 | Hash of the previous bundle in the chain |
| `sequence_number` | `uint64` | 18 | Monotonic sequence within this kernel's evidence chain |
| `signature` | `bytes` | 19 | Ed25519 signature over the bundle fields |
| `signing_key_id` | `string` | 20 | Identifier of the signing key used |
| `dev_signed` | `bool` | 21 | `true` if signed with a development key (not production) |
| `schema_version` | `uint32` | 22 | Schema version for forward compatibility |

---

## PolicyDistributionService

**Package:** `interdict.policy.v1`
**Proto file:** `proto/interdict/policy/v1/policy_distribution.proto`
**Default port:** `50052` (set via `INTERDICT_GRPC_PORT`)
**Component:** Control Plane (TypeScript/Bun)

Distributes compiled policy modules to the kernel fleet using an xDS-style server-streaming pattern. On initial connection the control plane sends a full policy snapshot; subsequent updates are pushed as deltas. Policies are cryptographically signed with Ed25519 for integrity verification.

### RPCs

| RPC | Type | Request | Response |
|-----|------|---------|----------|
| `Subscribe` | Server-streaming | `SubscribeRequest` | `stream SubscribeResponse` |
| `Acknowledge` | Unary | `AcknowledgeRequest` | `AcknowledgeResponse` |

### Subscribe

Server-streaming RPC. The kernel sends a single `SubscribeRequest` and receives a continuous stream of `SubscribeResponse` messages.

**Flow:**
1. Kernel connects with its `kernel_id` and `current_version` (0 for initial sync)
2. Control plane sends a `FULL_SNAPSHOT` containing all applicable policies
3. Stream stays open — delta updates are pushed as policies change
4. Each update carries a `version` counter and optional Ed25519 `signature`
5. Kernel loads policies and sends `Acknowledge` on a separate RPC

### Acknowledge

Unary RPC. The kernel acknowledges receipt and successful loading of a policy version. Used by the control plane to track fleet convergence.

**Flow:**
1. After loading policies from a `SubscribeResponse`, kernel sends `AcknowledgeRequest`
2. Set `accepted: true` for successful load, `false` (NACK) with `error_message` on failure
3. Control plane records the ack and returns `AcknowledgeResponse`

### Messages

#### SubscribeRequest

Sent by the kernel to initiate a policy subscription.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `kernel_id` | `string` | 1 | Unique identifier for this kernel instance |
| `current_version` | `uint64` | 2 | Kernel's current policy version (`0` = request full snapshot) |
| `org_id` | `string` | 3 | Organization ID for hierarchy-aware policy filtering |
| `dept_id` | `string` | 4 | Department ID for scoped filtering (optional) |
| `team_id` | `string` | 5 | Team ID for scoped filtering (optional) |

#### SubscribeResponse

Pushed by the control plane whenever policies change.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `version` | `uint64` | 1 | Monotonic version counter (higher = newer) |
| `type` | `UpdateType` | 2 | Type of update |
| `policies` | `repeated PolicyEntry` | 3 | Policies included in this update (new or changed) |
| `removed_policy_ids` | `repeated string` | 4 | Policy IDs removed in this update (delta only) |
| `signature` | `bytes` | 10 | Ed25519 signature over canonical serialization of policy entries |
| `signing_key_id` | `string` | 11 | Identifier of the signing key used (for key rotation) |

**UpdateType enum:**

| Value | Name | Description |
|-------|------|-------------|
| 0 | `UPDATE_TYPE_UNSPECIFIED` | Default (should not appear) |
| 1 | `UPDATE_TYPE_FULL_SNAPSHOT` | Full replacement of all policies |
| 2 | `UPDATE_TYPE_DELTA` | Incremental changes since last version |

#### PolicyEntry

A single policy included in a policy update.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `policy_id` | `string` | 1 | Unique identifier for this policy |
| `name` | `string` | 2 | Human-readable policy name |
| `version` | `uint64` | 3 | Policy version (monotonic per policy) |
| `wasm_bytes` | `bytes` | 4 | Compiled Wasm module (may be empty for Rego-only policies) |
| `wasm_hash` | `string` | 5 | SHA-256 hash of `wasm_bytes` for integrity verification |
| `rego_source` | `string` | 6 | Rego source code (may be empty for Wasm-only policies) |
| `entrypoint` | `string` | 7 | Rego entrypoint rule path (e.g., `data.interdict.policy.vendor.verdict`) |
| `scope` | `PolicyScope` | 8 | Organizational scope this policy applies to |
| `fail_mode` | `FailMode` | 9 | Behavior on evaluation error |

**FailMode enum:**

| Value | Name | Description |
|-------|------|-------------|
| 0 | `FAIL_MODE_UNSPECIFIED` | Default |
| 1 | `FAIL_MODE_FAIL_CLOSED` | Error → Block (conservative, security-first default) |
| 2 | `FAIL_MODE_FAIL_OPEN` | Error → Allow (use only for non-critical policies) |

#### PolicyScope

Defines the organizational scope a policy applies to.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `org_id` | `string` | 1 | Organization this policy belongs to (required) |
| `dept_id` | `string` | 2 | Department scope (empty = org-wide) |
| `team_id` | `string` | 3 | Team scope (empty = dept-wide or org-wide) |
| `vendor_ids` | `repeated string` | 4 | Vendor-specific scoping (empty = all vendors) |

#### AcknowledgeRequest

Sent by the kernel after processing a policy update.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `kernel_id` | `string` | 1 | Kernel instance that processed the update |
| `version` | `uint64` | 2 | Policy version being acknowledged |
| `accepted` | `bool` | 3 | `true` if policies were successfully loaded |
| `error_message` | `string` | 4 | Error description if not accepted (NACK) |

#### AcknowledgeResponse

Returned by the control plane.

| Field | Type | Number | Description |
|-------|------|--------|-------------|
| `acknowledged` | `bool` | 1 | `true` if the ack was recorded |

---

## Connection Details

| Service | Component | Default Address | Env Var | Transport |
|---------|-----------|----------------|---------|-----------|
| EvidenceCollectorService | Evidence Collector (Rust) | `[::]:50051` | `COLLECTOR_GRPC_LISTEN_ADDR` | gRPC with optional mTLS |
| PolicyDistributionService | Control Plane (TypeScript) | `0.0.0.0:50052` | `INTERDICT_GRPC_PORT` | gRPC (insecure in dev; mTLS planned) |

### TLS Configuration

- **Evidence Collector:** Supports mTLS when `COLLECTOR_TLS_CERT_PATH` and `COLLECTOR_TLS_KEY_PATH` are set. See [Operator Guide — Certificates](../operator/guide.md#certificates--tls).
- **Policy Distribution:** Currently uses insecure gRPC transport. mTLS support is planned. Policies are signed with Ed25519 for integrity verification regardless of transport security.

### Max Message Size

| Service | Default | Env Var |
|---------|---------|---------|
| PolicyDistributionService | 16 MiB | `INTERDICT_GRPC_MAX_MESSAGE_SIZE` |

### Proto File Locations

```
proto/
└── interdict/
    ├── evidence/
    │   └── v1/
    │       └── evidence.proto
    └── policy/
        └── v1/
            └── policy_distribution.proto
```

### Client Connection Example

```bash
# Using grpcurl to test evidence collector
grpcurl -plaintext localhost:50051 \
  interdict.evidence.v1.EvidenceCollectorService/SubmitEvidence

# Using grpcurl to test policy distribution
grpcurl -plaintext localhost:50052 \
  interdict.policy.v1.PolicyDistributionService/Subscribe
```

---

## Related Documentation

- [REST API Reference](rest.md) — control plane HTTP endpoints (53 endpoints across 13 modules)
- [Operator Guide](../operator/guide.md) — deployment, configuration, and operations
- [Troubleshooting Guide](../operator/troubleshooting.md) — diagnostic procedures
