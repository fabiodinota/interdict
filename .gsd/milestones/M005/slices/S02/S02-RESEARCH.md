# Phase 31 Research: Distribution TLS & Evidence Query Scale Hardening

**Phase:** 31
**Name:** Distribution TLS & Evidence Query Scale Hardening
**Date:** 2026-03-11
**Status:** Complete

## Objective

Research how to implement Phase 31 well within the approved boundary:

- remove the hard-coded TLS server name from kernel policy distribution
- add partition-friendly `event_date` filters to the remaining high-value `evidence_bundles` queries in the control-plane
- avoid widening scope into dashboard auth, infra linting, warning burn-down, or doc cleanup

## Key Findings

### 1. The kernel distribution client hard-codes the control-plane TLS server name

Current code:

- `crates/kernel/src/policy/distribution/client.rs`
- `build_tls_config()` always uses `.domain_name("control-plane")`

This is the exact high finding from the latest scan. It bakes deployment topology into the data-plane/control-plane link.

### 2. The configuration path already exists for adding this cleanly

Relevant files:

- `crates/kernel/src/config.rs`
- `crates/kernel/src/main.rs`

The kernel already has a `DistributionConfig` with these related fields:

- `distribution_addr`
- `mtls_ca_cert_path`
- `mtls_client_cert_path`
- `mtls_client_key_path`

`main.rs` already builds the `DistributionClient` from `dist_config` and conditionally calls `with_mtls(...)`. This means the phase does **not** need a new architecture; it only needs one more config field to be threaded through this existing path.

### 3. There is an existing naming pattern for a second hard-coded TLS peer

`crates/kernel/src/evidence/client.rs` also hard-codes `.domain_name("evidence-collector")`.

That is out of scope for Phase 31 unless the implementation naturally generalizes a shared pattern with very low risk. The locked phase boundary is policy distribution + evidence query scale only.

### 4. The control-plane already has a good `event_date` partition pattern elsewhere

Strong reference implementations already exist in:

- `control-plane/src/modules/audit/queries.ts`
- `control-plane/src/modules/reports/service.ts`
- `control-plane/src/modules/anomalies/queries.ts`

Common pattern:

- add `event_date >= {from_date:String}` / `event_date <= {to_date:String}`
- carry separate `DateTime64(3)` timestamp params where ordering/cursors require them
- normalize DateTime values with helper functions like `toChDateTime()`

Phase 31 should reuse this pattern instead of inventing a new query style.

### 5. The remaining problematic `evidence_bundles` queries are narrow and identifiable

#### Reviews service

`control-plane/src/modules/reviews/service.ts`

Two places still hit `evidence_bundles` without `event_date` filters:

1. `reconcileEscalations()`
   - query by `policy_action = 'escalate'` and recent `timestamp >= {since:DateTime64(3)}`
   - easy candidate to derive `event_date` from the same `since` timestamp

2. bundle enrichment in `enrichWithBundleDetails()`
   - query by `bundle_id IN {ids:Array(String)}`
   - trickier because current inputs do not carry bundle dates directly

#### Evidence verification service

`control-plane/src/modules/evidence/service.ts`

Two private helpers still miss `event_date` filters:

1. `fetchBundles(bundleIds)`
   - query by `bundle_id IN {ids:Array(String)}`
2. `fetchPredecessor(kernelId, sequenceNumber)`
   - query by `kernel_id + sequence_number`

These are verification-sensitive reads and should become partition-aware without breaking verification semantics.

## Recommended Implementation Direction

### A. Kernel TLS hostname hardening

Recommended direction:

1. Add a new `DistributionConfig` field for the expected TLS server name, e.g. `mtls_server_name` or `distribution_tls_server_name`
2. Load it from env/config alongside the existing mTLS cert paths
3. Thread it from `config.rs` -> `main.rs` -> `DistributionClient`
4. Make `build_tls_config()` use the configured value rather than the hard-coded string

Good default strategy:

- require explicit configuration whenever distribution mTLS is enabled, or
- default to `control-plane` for backward compatibility but make the value overrideable and visible in docs/tests

Given the hardening goal, the cleaner option is to make it explicit whenever mTLS distribution is used.

### B. `event_date` partition pruning hardening

Recommended direction by query type:

#### `reconcileEscalations()`
- derive `from_date` directly from `oneHourAgo`
- add `event_date >= {from_date:String}` to the same query

#### Bundle enrichment / verification lookups by `bundle_id`
- best medium-scope option: query the minimal date-bearing row set first or carry `event_date` forward from known operator-facing results before issuing the detail fetch
- if the calling code already has timestamps for the relevant bundles, use those to derive bounded date windows
- avoid unbounded `bundle_id IN (...)` over `evidence_bundles`

#### Predecessor lookup by `kernel_id + sequence_number`
- if the current bundle is already loaded, use its timestamp/event_date to constrain predecessor lookup to the same day or a small bounded window around the bundle timestamp
- keep the correctness guard: sequence lookups must still find the predecessor for valid chains that cross edge cases like day boundaries, so tests need to cover that

## Likely Files To Touch

### Kernel

- `crates/kernel/src/config.rs`
- `crates/kernel/src/main.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- likely kernel config tests in `crates/kernel/src/config.rs` and/or distribution-client tests in `client.rs`

### Control-plane

- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/service.test.ts`
- `control-plane/src/modules/evidence/service.ts`
- `control-plane/src/modules/evidence/service.test.ts`

Potential follow-on only if required by the implementation:

- env/example or deployment config files if the new kernel TLS server-name field must be surfaced for operators

## Test Strategy

### Kernel / distribution

- config parsing test proves the new TLS server-name field loads correctly
- client test proves the TLS config uses the configured server name, not a hard-coded literal
- if current tests spin up loopback TLS helpers, add one case using a non-default expected server name

### Reviews service

- query-shape tests/assertions should prove `reconcileEscalations()` includes `event_date`
- enrichment tests should prove detail fetches are date-bounded when reading from `evidence_bundles`

### Evidence verification service

- helper/query tests should prove `fetchBundles()` and `fetchPredecessor()` include partition-friendly date filters
- add at least one edge case for predecessor lookup where the chain is near a day boundary so correctness is not lost while pruning

## Common Pitfalls

1. **Do not solve this with another hard-coded hostname.** The point is configurability, not moving the literal.
2. **Do not over-generalize into the evidence gRPC client unless it is nearly free.** That belongs in a later phase unless the implementation becomes naturally shared.
3. **Do not add `event_date` filters that can silently miss valid predecessors.** Partition pruning must not break verification correctness.
4. **Do not mix date and timestamp parameter formats inconsistently.** Reuse the existing `DateTime64(3)` + string-date pattern already used by audit/reports.
5. **Do not widen Phase 31 into generic ClickHouse query cleanup.** Focus only on the identified `evidence_bundles` paths.

## Planning Guidance

This phase should likely be planned as 2 execution plans in the same wave:

1. kernel distribution TLS hostname configurability
2. control-plane `evidence_bundles` partition-pruning fixes + tests

These work streams touch different subsystems and can execute in parallel, then be verified together.