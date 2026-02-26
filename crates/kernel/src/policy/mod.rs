//! Policy evaluation engine for the Interdict kernel proxy.
//!
//! Implements a 3-layer policy pipeline:
//! - **Layer 1:** Deterministic rules (Rego via Regorus, vendor allowlist)
//! - **Layer 2:** NLP classifier (ONNX model via tract) for ambiguous cases
//! - **Layer 3:** Human review queue for genuinely uncertain requests
//!
//! All matching policies are evaluated (no short-circuiting). Verdicts are merged
//! using most-restrictive-wins: Block > Redact > Allow. Overlapping redactions
//! are unioned additively.

pub mod config;
pub mod layer1;
pub mod verdict;
pub mod wasm_engine;

use serde::{Deserialize, Serialize};

/// Direction of the intercepted traffic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    /// Outbound: prompt sent from employee to AI vendor.
    Outbound,
    /// Inbound: response received from AI vendor.
    Inbound,
}

/// Request context carried through the entire policy pipeline.
///
/// Contains the metadata and content needed for policy evaluation,
/// redaction decisions, and audit trail generation.
#[derive(Debug, Clone)]
pub struct RequestContext {
    /// Unique identifier for this request (correlates across layers).
    pub request_id: uuid::Uuid,
    /// Target AI vendor domain (e.g., "api.openai.com").
    pub vendor: String,
    /// HTTP method (e.g., "POST", "GET").
    pub method: String,
    /// Request path (e.g., "/v1/chat/completions").
    pub path: String,
    /// Content-Type header if present.
    pub content_type: Option<String>,
    /// Body content if available (for redaction evaluation).
    pub content: Option<String>,
    /// Direction: outbound (prompt) or inbound (response).
    pub direction: Direction,
}
