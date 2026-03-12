---
id: T01
parent: S02
milestone: M005
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T01: 31-distribution-tls-evidence-query-scale-hardening 01

**# Plan 31-01 Summary**

## What Happened

# Plan 31-01 Summary

- Added `policy.distribution.tls_server_name` to the kernel config, sourced from `KERNEL_DISTRIBUTION_TLS_SERVER_NAME`, and fail-closed validation for HTTPS+mTLS distribution startup when the value is missing.
- Threaded the configured TLS server identity through `crates/kernel/src/main.rs` into `DistributionClient` so policy distribution no longer hard-codes `control-plane` in Rust source.
- Surfaced the setting through `docker/kernel/interdict.toml.template`, `docker-compose.yml`, `.env`, and Helm kernel config so operators can override the expected control-plane certificate hostname without patching source.
- Verified structurally with `cargo fmt --all -- --check`, a no-match grep for `.domain_name("control-plane")`, and config surface checks for `KERNEL_DISTRIBUTION_TLS_SERVER_NAME`.

Key files:
- `crates/kernel/src/config.rs`
- `crates/kernel/src/main.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `docker/kernel/interdict.toml.template`
- `docker-compose.yml`
- `.env`
- `helm/interdict/templates/kernel/configmap.yaml`
- `helm/interdict/values.yaml`
