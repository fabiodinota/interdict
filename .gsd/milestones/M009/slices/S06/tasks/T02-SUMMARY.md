---
id: T02
parent: S06
milestone: M009
provides:
  - Deterministic kernel review queue test synchronization via mpsc notification channel
key_files:
  - crates/kernel/src/policy/layer3/queue.rs
key_decisions:
  - Used mpsc::unbounded_channel instead of watch channel — watch coalesces signals, so test_escalate_concurrent_limit (2 spawned escalations) could deadlock on second rx.changed() if both sends fire before first await. mpsc queues discrete messages, safe for N signals.
patterns_established:
  - "#[cfg(test)] notification channel on async structs for deterministic test synchronization"
observability_surfaces:
  - none (test-only change, zero production footprint)
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Fix flaky kernel review queue tests with notification channel

**Replaced 4 sleep(50ms) race conditions in queue tests with deterministic mpsc notification channel**

## What Happened

Added a `#[cfg(test)] pub escalation_notify: Option<tokio::sync::mpsc::UnboundedSender<()>>` field to `ReviewQueue`. In `escalate()`, after `self.pending.insert()`, the method signals the channel if present. Four tests that previously used `tokio::time::sleep(Duration::from_millis(50))` to race against async registration now create an `mpsc::unbounded_channel`, assign the sender to the queue, and `rx.recv().await` for the exact insertion event.

Deviated from the plan's `watch` channel to `mpsc::unbounded_channel` — `test_escalate_concurrent_limit` spawns 2 escalations and needs 2 discrete signals. `watch` coalesces sends, so the second `rx.changed()` would deadlock if both sends complete before the first await. `mpsc` queues each send discretely, making `recv()` × N correct for all tests.

## Verification

- `cargo test -p kernel -- queue --test-threads=1` — 3 consecutive runs, 12/12 passed each time, zero flakes
- `cargo clippy -p kernel -- -D warnings` — clean
- `cargo fmt -p kernel -- --check` — clean

### Slice-level checks (intermediate — T02 of 5):
- ✅ `cargo test -p kernel --test-threads=1` — passes deterministically
- ✅ `cargo clippy` / `cargo fmt` — clean for kernel crate
- ⬜ `buf lint` — not re-run (no proto changes in T02, passed in T01)
- ⬜ `cargo build --workspace` — not re-run (kernel built and tested successfully)
- ⬜ `cargo test -p evidence-collector` — T03/T04 scope
- ⬜ `cargo test -p interdict-verify` — T03 scope
- ⬜ `cargo test --workspace --all-targets` — deferred to final task
- ⬜ `bun test` (control-plane/) — T05 scope
- ⬜ `npx vitest run` (dashboard/) — T05 scope

## Diagnostics

None — test-only change. If a queue test fails after this change, the failure is a real logic bug (not a timing race), making it directly actionable.

## Deviations

Used `mpsc::unbounded_channel` instead of `watch::channel` specified in the plan. Reason: watch coalesces multiple sends into one state update, which would cause `test_escalate_concurrent_limit` to deadlock waiting for a second `changed()` signal that was already consumed. mpsc provides discrete per-send messages, correct for all 4 test patterns.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/src/policy/layer3/queue.rs` — Added `#[cfg(test)] escalation_notify` field, signal in `escalate()`, replaced `sleep(50ms)` with `rx.recv()` in 4 tests
