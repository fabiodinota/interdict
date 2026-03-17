---
id: "19-01"
parent: "19"
milestone: v1.2
provides:
  - Real actor identity in evidence bundles from request headers
  - Bounded retry queue replacing fire-and-forget evidence flush
  - DeliveryHealth metrics for operator visibility into evidence loss
key_files:
  - crates/kernel/src/proxy/connect.rs
  - crates/kernel/src/evidence/mod.rs
  - crates/kernel/src/evidence/bundle.rs
  - crates/kernel/src/evidence/client.rs
key_decisions:
  - "Identity from X-Interdict-Actor-Id, X-Interdict-Department, X-Interdict-Model headers"
  - "Retry queue: 7 retries max, 64 batches max"
  - "High-assurance mode blocks while evidence is dropped"
duration: "1 session"
commit: 0d190c3
---

# Phase 19, Task 1 — Summary

Replaced all 9 hardcoded "anonymous"/"unknown" actor values with real identity extracted from request headers. Added ActorIdentity struct and threaded it through ProxyService -> handle_connect() -> build_evidence_event().

Replaced fire-and-forget flush_batch with a bounded retry queue (up to 7 retries, max 64 queued batches). Added DeliveryHealth metrics (batches_sent, batches_failed, events_dropped, retries, consecutive_failures) so operators can detect evidence loss. High-assurance mode now cannot proceed while evidence delivery is actively failing.
