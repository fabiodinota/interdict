//! In-memory review queue with connection hold semantics.
//!
//! Holds the user's connection via a tokio oneshot channel until a
//! human reviewer submits a verdict or the timeout expires. On timeout,
//! the policy's fail-mode is applied (fail-closed → Block, fail-open → Allow).
//!
//! Implemented in Task 2 of Plan 02-03.
