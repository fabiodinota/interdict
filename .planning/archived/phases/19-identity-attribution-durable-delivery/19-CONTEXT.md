# Phase 19: Identity Attribution and Durable Evidence Delivery — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Evidence bundles were stamped with hardcoded "anonymous"/"unknown" actor values — 9 separate sites. This undermined the auditability claim. Simultaneously, the evidence flush path was fire-and-forget: if the collector was unreachable, events were silently dropped with no retry, no metric, and no operator signal.

## Scope

- Extract real actor identity from request headers into evidence bundles
- Thread identity through ProxyService -> handle_connect() -> build_evidence_event()
- Replace all hardcoded anonymous/unknown values
- Replace fire-and-forget flush with a bounded retry queue
- Add delivery health metrics for operator visibility

## Key Files

- `crates/kernel/src/proxy/connect.rs`
- `crates/kernel/src/evidence/mod.rs`
- `crates/kernel/src/evidence/bundle.rs`
- `crates/kernel/src/evidence/client.rs`
