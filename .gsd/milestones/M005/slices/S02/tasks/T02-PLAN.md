# T02: 31-distribution-tls-evidence-query-scale-hardening 02

**Slice:** S02 — **Milestone:** M005

## Description

Make the remaining operator-facing and verification-sensitive `evidence_bundles` reads partition-safe in ClickHouse without breaking review or evidence verification behavior.

Purpose: satisfy `HR-EVID-01` and keep Phase 31 focused on the identified high-value evidence/review flows only.
Output: bounded review/evidence queries plus focused regression tests for query shape and day-boundary correctness.

## Must-Haves

- [ ] Review reconciliation and review-queue enrichment no longer issue unbounded `evidence_bundles` reads across all ClickHouse partitions.
- [ ] Evidence verification fetches bundles and predecessors with date-bounded ClickHouse reads while preserving verification correctness.
- [ ] Bundles near a day boundary still verify correctly after partition pruning is added.

## Files

- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/service.test.ts`
- `control-plane/src/modules/evidence/service.ts`
- `control-plane/src/modules/evidence/service.test.ts`
