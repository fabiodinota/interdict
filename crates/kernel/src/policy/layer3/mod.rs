//! Layer 3: Human review queue for genuinely uncertain requests.
//!
//! When the NLP classifier (Layer 2) returns 'uncertain', the request
//! escalates to Layer 3 where a human reviewer decides. The user's
//! connection is held via a oneshot channel until a verdict arrives
//! or the timeout expires (applying the policy's fail-mode).
//!
//! - `queue`: In-memory review queue with connection hold semantics.
//! - `store`: SQLite persistence layer with WAL mode for dashboard integration.

pub mod queue;
pub mod store;
