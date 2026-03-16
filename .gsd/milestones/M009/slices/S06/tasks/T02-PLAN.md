---
estimated_steps: 4
estimated_files: 1
---

# T02: Fix flaky kernel review queue tests with notification channel

**Slice:** S06 — Proto Safety, Observability & Testing
**Milestone:** M009

## Description

Four tests in `queue.rs` use `tokio::time::sleep(Duration::from_millis(50))` to wait for async `escalate()` to complete, causing intermittent CI failures. Replace with a deterministic notification channel that signals after `pending.insert()` completes, so tests wait on a concrete event instead of racing against wall time.

## Steps

1. **Add test-only notification channel to `ReviewQueue`:** In `crates/kernel/src/policy/layer3/queue.rs`, add a field to the `ReviewQueue` struct:
   ```rust
   #[cfg(test)]
   pub escalation_notify: Option<tokio::sync::watch::Sender<()>>,
   ```
   In the `ReviewQueue::new()` constructor, initialize it to `None`. Add `#[cfg(test)]` to the field so it has zero production impact.

2. **Signal after pending insert in `escalate()`:** In the `escalate()` method, after the line that does `self.pending.insert(...)` (where the review item is added to the pending map), add:
   ```rust
   #[cfg(test)]
   if let Some(ref tx) = self.escalation_notify {
       let _ = tx.send(());
   }
   ```
   This signals any waiting test receiver that the insertion is complete.

3. **Update all 4 tests to use the channel:** For each test that currently uses `tokio::time::sleep(Duration::from_millis(50))` (approximately lines 290, 362, 455, 490):
   - Create a watch channel: `let (tx, mut rx) = tokio::sync::watch::channel(());`
   - Set `queue.escalation_notify = Some(tx);` after creating the queue
   - Replace `tokio::time::sleep(Duration::from_millis(50)).await;` with `rx.changed().await.unwrap();`
   - If the test creates the queue via `ReviewQueue::new(...)`, you may need to assign the notify field afterward since `new()` sets it to `None`
   - Verify the test still exercises the same behavior — the channel replaces the timing wait, not the logical flow

4. **Run verification:** Execute `cargo test -p kernel -- queue --test-threads=1` at least 3 times in a row to confirm zero flakes. Also run `cargo clippy -p kernel -- -D warnings` and `cargo fmt -p kernel -- --check`.

## Must-Haves

- [ ] `escalation_notify` field is `#[cfg(test)]` on ReviewQueue — zero production overhead
- [ ] All 4 `sleep(50ms)` calls in test functions are replaced with `rx.changed().await`
- [ ] Tests still exercise the same escalation logic (no behavioral change, only timing change)
- [ ] `cargo test -p kernel -- queue --test-threads=1` passes deterministically

## Verification

- `cargo test -p kernel -- queue --test-threads=1` — all queue tests pass
- Run 3 consecutive times with zero failures to confirm determinism
- `cargo clippy -p kernel -- -D warnings` — clean
- `cargo fmt -p kernel -- --check` — clean

## Inputs

- `crates/kernel/src/policy/layer3/queue.rs` — 4 test functions with `sleep(Duration::from_millis(50))` at approximately lines 290, 362, 455, 490. The `ReviewQueue` struct and `escalate()` method are in the same file.

## Expected Output

- `crates/kernel/src/policy/layer3/queue.rs` — `ReviewQueue` gains `#[cfg(test)] escalation_notify` field, `escalate()` signals on insert, all 4 tests use channel-based synchronization instead of sleep
