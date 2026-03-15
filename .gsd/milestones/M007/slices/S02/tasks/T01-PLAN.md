---
estimated_steps: 3
estimated_files: 1
---

# T01: Add store cleanup_old and queue edge-case tests

**Slice:** S02 — Layer 3 Queue + Evidence Signing Tests
**Milestone:** M007

## Description

The `cleanup_old()` method on `ReviewQueueStore` is the only completely untested public method. It deletes old reviewed/expired items from SQLite based on an age threshold. The existing test helpers (`make_test_item`, `make_expired_item`, in-memory SQLite) make this straightforward. Also add an ordering assertion for `get_pending()` to verify oldest-first semantics.

## Steps

1. Add `test_cleanup_old_deletes_reviewed_and_expired` — enqueue items, mark some as reviewed (via `submit_verdict`) and expired (via `expire_timed_out`), call `cleanup_old(1)`, assert only old reviewed/expired items are deleted and pending items survive. Use `make_expired_item()` (created_at 2020-01-01) so items are well past any cleanup threshold.
2. Add `test_cleanup_old_preserves_recent_reviewed` — enqueue an item, review it, call `cleanup_old(9999)` (huge threshold), assert nothing is deleted because the item is too recent.
3. Add `test_get_pending_returns_oldest_first` — enqueue 3 items with different `created_at` timestamps, assert `get_pending()` returns them in ascending creation order.

## Must-Haves

- [ ] `cleanup_old()` tested: deletes old reviewed/expired, preserves pending, returns correct count
- [ ] `cleanup_old()` tested: respects age threshold (recent reviewed items not deleted)
- [ ] `get_pending()` ordering explicitly asserted
- [ ] All 8 existing store tests still pass

## Verification

- `cargo test -p kernel -- store --nocapture` — all tests pass including new ones
- `cargo clippy -p kernel -- -D warnings` — no warnings

## Observability Impact

- Runtime signals changed: none — test-only, no runtime code modified
- Inspection: `cargo test -p kernel -- store --nocapture` shows per-test pass/fail with assertion messages
- Failure visibility: test names (`cleanup_old_deletes_reviewed_and_expired`, `cleanup_old_preserves_recent_reviewed`, `get_pending_returns_oldest_first`) directly identify the coverage gap

## Inputs

- `crates/kernel/src/policy/layer3/store.rs` — existing test module with `make_test_item()`, `make_expired_item()` helpers and `:memory:` SQLite pattern

## Expected Output

- `crates/kernel/src/policy/layer3/store.rs` — 3 new test functions added to existing `#[cfg(test)] mod tests`
