# T03: Plan 03

**Slice:** S02 — **Milestone:** M001

## Description

Build the Layer 3 human review queue with SQLite persistence, connection-hold semantics, and timeout/fail-mode handling. This is the async escalation path for genuinely ambiguous requests where the NLP classifier returns 'uncertain'.

Purpose: Layer 3 is the safety net for cases that deterministic rules and ML can't resolve. The queue holds the user's connection for 30-60 seconds while waiting for a human reviewer, then applies the policy's fail-mode if no decision arrives. The SQLite backend persists queue state for dashboard integration in Phase 8/9.

Output: layer3/queue.rs (in-memory queue with connection hold via oneshot channels), layer3/store.rs (SQLite persistence layer).
