---
id: T01
parent: S02
milestone: M007
provides:
  - cleanup_old test coverage for ReviewQueueStore
  - get_pending ordering assertion
key_files:
  - crates/kernel/src/policy/layer3/store.rs
key_decisions: []
patterns_established:
  - make_item_at() helper for timestamp-specific test items
observability_surfaces:
  - none
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Add store cleanup_old and queue edge-case tests

**Added 3 tests covering `cleanup_old()` deletion/preservation semantics and `get_pending()` oldest-first ordering.**

## What Happened

Added three new test functions to `crates/kernel/src/policy/layer3/store.rs`:

1. `test_cleanup_old_deletes_reviewed_and_expired` — enqueues old items (created_at 2020), marks one as reviewed via `submit_verdict` and one as expired via `expire_timed_out`, calls `cleanup_old(1)`, asserts both are deleted and a pending item survives. Asserts correct deletion count (2).
2. `test_cleanup_old_preserves_recent_reviewed` — enqueues a recent item (created_at 2026), reviews it, calls `cleanup_old(9999)`, asserts 0 deletions and the item still exists.
3. `test_get_pending_returns_oldest_first` — enqueues 3 items with distinct `created_at` timestamps in non-chronological insertion order, asserts `get_pending()` returns them in ascending creation order.

Also added a `make_item_at(request_id, created_at)` helper for creating items with specific timestamps.

## Verification

- `cargo test -p kernel -- store --nocapture` — 12/12 tests pass (8 existing + 3 new + 1 queue test)
- `cargo clippy -p kernel -- -D warnings` — zero warnings
- `cargo fmt --all -- --check` — formatted (ran `cargo fmt` to fix minor formatting in new code)

Slice-level checks (intermediate task — partial passes expected):
- ✅ `cargo test -p kernel -- queue store --nocapture` — all pass
- ⏳ `cargo test -p evidence-collector -- signing chain` — T02 scope
- ✅ `cargo clippy` — clean
- ✅ `cargo fmt` — clean

## Diagnostics

- `cargo test -p kernel -- store --nocapture` shows per-test pass/fail with assertion messages
- Test names directly identify coverage gaps: `cleanup_old_deletes_reviewed_and_expired`, `cleanup_old_preserves_recent_reviewed`, `get_pending_returns_oldest_first`

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/src/policy/layer3/store.rs` — added 3 test functions and `make_item_at()` helper
- `.gsd/milestones/M007/slices/S02/tasks/T01-PLAN.md` — added missing Observability Impact section (pre-flight fix)
