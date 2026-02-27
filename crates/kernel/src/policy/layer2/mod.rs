//! Layer 2: NLP classifier for ambiguous cases.
//!
//! When Layer 1 Rego rules return no explicit match (neither allow/block/redact),
//! the request escalates to the Layer 2 NLP classifier. The classifier uses a
//! tract-ONNX model to classify request intent/risk, with a dedicated 'uncertain'
//! output class that triggers escalation to Layer 3 human review.
//!
//! The classifier interface is model-agnostic: it loads any ONNX model with
//! configurable output labels. A stub classifier is provided for testing and
//! for deployments where no ONNX model is configured.
//!
//! Background dispatch via `BackgroundL2` enables non-blocking analytics/audit
//! enrichment when Layer 1 returns an explicit verdict (classification data
//! is logged alongside the verdict for analytics).

pub mod classifier;
pub mod injection;
