# Phase 31: Distribution TLS & Evidence Query Scale Hardening - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Source:** Default v1.4 split approved by the user during post-assessment planning

<domain>
## Phase Boundary

Phase 31 focuses only on the remaining post-Phase-30 hardening work around:

- the kernel distribution client's hard-coded TLS server name
- ClickHouse evidence query shapes that miss `event_date` partition filters in operator-facing and verification-sensitive flows

This phase is hardening only. No new end-user product features.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Use the approved default v1.4 phase split.
- Phase 31 covers distribution TLS configurability and evidence query scale hardening only.
- Remove hard-coded deployment topology from the kernel/control-plane TLS link.
- Make evidence/review flows partition-safe for `evidence_bundles` queries.
- Do not widen scope into dashboard auth/session work, infra linting, warning burn-down, or doc cleanup in this phase.

### Claude's Discretion
- Choose the exact runtime/deployment config field names for the TLS server name.
- Choose the least invasive way to carry `event_date` bounds into the affected ClickHouse queries.
- Decide whether to add targeted tests at the service/query layer or broader integration coverage where the current harness supports it.

</decisions>

<specifics>
## Specific Ideas

- High finding: `crates/kernel/src/policy/distribution/client.rs` hard-codes `.domain_name("control-plane")`
- Medium findings: `control-plane/src/modules/reviews/service.ts` and `control-plane/src/modules/evidence/service.ts` query `evidence_bundles` without `event_date` filters in important paths
- Preserve deployment compatibility across VPC-native, sidecar, and air-gapped modes
- Keep ClickHouse parameter formatting aligned with existing `DateTime64(3)` and date-normalization patterns

</specifics>

<deferred>
## Deferred Ideas

- Repo-wide infra lint coverage (`hadolint`, `helm lint`, `buf lint`, `shellcheck`, `yamllint`)
- Control-plane/dashboard warning burn-down
- Next 16 `middleware` -> `proxy` cleanup
- Planning/state doc synchronization and untracking local settings

</deferred>

---

*Phase: 31-distribution-tls-evidence-query-scale-hardening*
*Context gathered: 2026-03-11 via direct user approval of default v1.4 split*
