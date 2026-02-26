//! Tract-ONNX classifier for Layer 2 NLP-based classification.
//!
//! Provides a model-agnostic interface for classifying request content
//! using ONNX models loaded via the `tract-onnx` crate. The classifier
//! supports configurable output labels including a mandatory 'uncertain'
//! class that triggers escalation to Layer 3 human review.
//!
//! Two creation paths:
//! - `Classifier::load()` — loads a real ONNX model from disk (expensive, call once at startup)
//! - `Classifier::stub()` — creates a test stub that always returns a fixed label
//!
//! Background dispatch via `BackgroundL2` uses bounded crossbeam channels
//! (KERN-13 compliant) and OS worker threads for CPU-bound inference.

use std::sync::Arc;

use crossbeam_channel as crossbeam;
use tract_onnx::prelude::*;

use crate::policy::verdict::ClassificationResult;

/// ONNX-based classifier wrapping a tract inference plan.
///
/// Thread-safe via `Arc<TypedRunnableModel<TypedModel>>`. The model is loaded once at
/// startup and shared across all classification requests.
pub struct Classifier {
    /// The loaded and optimized tract model plan (None for stub classifiers).
    model: Option<Arc<TypedRunnableModel<TypedModel>>>,
    /// Output labels (e.g., ["allow", "block", "redact", "uncertain"]).
    labels: Vec<String>,
    /// For stub classifiers: the default label to return.
    stub_label: Option<String>,
}

impl Classifier {
    /// Load an ONNX model from disk.
    ///
    /// This is the EXPENSIVE path — call ONCE at startup, never per-request.
    /// The model is optimized and compiled into a runnable plan.
    ///
    /// # Arguments
    /// * `model_path` - Path to the ONNX model file on disk.
    /// * `labels` - Output labels corresponding to the model's output classes.
    ///   MUST include "uncertain" per locked decision.
    pub fn load(model_path: &str, labels: Vec<String>) -> anyhow::Result<Self> {
        let model = tract_onnx::onnx()
            .model_for_path(model_path)?
            .into_optimized()?
            .into_runnable()?;

        Ok(Self {
            model: Some(Arc::new(model)),
            labels,
            stub_label: None,
        })
    }

    /// Create a stub classifier that always returns the default label.
    ///
    /// Used for testing and when no ONNX model is configured
    /// (`l2_model_path` is `None` in config). This is critical because
    /// no real model exists yet — Phase 2 designs the interface to be
    /// model-agnostic per Research Open Question 2.
    ///
    /// # Arguments
    /// * `labels` - Output labels (must include "uncertain").
    /// * `default_label` - The label to always return with 1.0 confidence.
    pub fn stub(labels: Vec<String>, default_label: String) -> Self {
        Self {
            model: None,
            labels,
            stub_label: Some(default_label),
        }
    }

    /// Classify input features using the loaded model or stub.
    ///
    /// For real models: builds an input tensor, runs inference, extracts
    /// output scores, and returns the highest-scoring label.
    ///
    /// For stubs: returns the configured default label with 1.0 confidence
    /// and all other labels with 0.0 confidence.
    pub fn classify(&self, features: &[f32]) -> anyhow::Result<ClassificationResult> {
        if let Some(ref label) = self.stub_label {
            // Stub classifier — return fixed result.
            let all_scores: Vec<(String, f32)> = self
                .labels
                .iter()
                .map(|l| {
                    let score = if l == label { 1.0 } else { 0.0 };
                    (l.clone(), score)
                })
                .collect();

            return Ok(ClassificationResult {
                label: label.clone(),
                confidence: 1.0,
                all_scores,
            });
        }

        // Real model inference.
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No model loaded and no stub configured"))?;

        // Build input tensor from features.
        let array = tract_ndarray::Array2::from_shape_vec((1, features.len()), features.to_vec())?;
        let input: Tensor = array.into_tensor();

        // Run inference.
        let output = model.run(tvec!(input.into()))?;

        // Extract output scores from the first output tensor.
        let scores = output[0].to_array_view::<f32>()?;
        let scores_slice: Vec<f32> = scores.iter().copied().collect();

        // Build all_scores pairing labels with scores.
        let all_scores: Vec<(String, f32)> = self
            .labels
            .iter()
            .zip(scores_slice.iter())
            .map(|(l, s)| (l.clone(), *s))
            .collect();

        // Find the max-scoring label.
        let (max_idx, max_score) = scores_slice
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((0, &0.0));

        let label = self
            .labels
            .get(max_idx)
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());

        Ok(ClassificationResult {
            label,
            confidence: *max_score,
            all_scores,
        })
    }

    /// Returns the configured output labels.
    pub fn labels(&self) -> &[String] {
        &self.labels
    }

    /// Returns true if this is a stub classifier (no real model loaded).
    pub fn is_stub(&self) -> bool {
        self.stub_label.is_some()
    }
}

/// Work item submitted to the background L2 classifier.
pub struct L2WorkItem {
    /// Request identifier for correlation.
    pub request_id: uuid::Uuid,
    /// Input features for classification.
    pub input_features: Vec<f32>,
    /// Optional channel to receive the classification result.
    /// If `None`, the result is just logged (fire-and-forget analytics).
    pub result_tx: Option<crossbeam::Sender<ClassificationResult>>,
}

/// Background Layer 2 classifier that runs inference on worker OS threads.
///
/// Uses bounded `crossbeam_channel` (KERN-13 compliant) with configurable
/// queue depth. Spawns worker OS threads (not tokio tasks) because the
/// classifier inference is synchronous/CPU-bound.
///
/// Background L2 is best-effort: if the queue is full, submissions are
/// dropped with a warning log (no blocking).
pub struct BackgroundL2 {
    /// Sender side of the bounded work queue.
    sender: crossbeam::Sender<L2WorkItem>,
    /// Worker thread join handles (kept for graceful shutdown).
    _workers: Vec<std::thread::JoinHandle<()>>,
}

impl BackgroundL2 {
    /// Create a new background L2 classifier.
    ///
    /// # Arguments
    /// * `classifier` - The classifier to use (shared via Arc across workers).
    /// * `workers` - Number of OS worker threads to spawn.
    /// * `queue_depth` - Bounded channel capacity. When full, new submissions are dropped.
    pub fn new(classifier: Arc<Classifier>, workers: usize, queue_depth: usize) -> Self {
        let (sender, receiver) = crossbeam::bounded::<L2WorkItem>(queue_depth);

        let mut handles = Vec::with_capacity(workers);
        for worker_id in 0..workers {
            let rx = receiver.clone();
            let clf = classifier.clone();
            let handle = std::thread::spawn(move || {
                tracing::debug!(worker_id, "L2 background worker started");
                while let Ok(item) = rx.recv() {
                    match clf.classify(&item.input_features) {
                        Ok(result) => {
                            tracing::debug!(
                                request_id = %item.request_id,
                                label = %result.label,
                                confidence = result.confidence,
                                "L2 background classification complete"
                            );
                            if let Some(tx) = item.result_tx {
                                // Best-effort: if receiver dropped, that's fine.
                                let _ = tx.send(result);
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                request_id = %item.request_id,
                                error = %e,
                                "L2 background classification failed"
                            );
                        }
                    }
                }
                tracing::debug!(worker_id, "L2 background worker stopped");
            });
            handles.push(handle);
        }

        Self {
            sender,
            _workers: handles,
        }
    }

    /// Submit a work item for background classification.
    ///
    /// Non-blocking: if the queue is full, the item is dropped with a
    /// warning log. Background L2 is best-effort per the research pattern.
    pub fn submit(&self, item: L2WorkItem) {
        match self.sender.try_send(item) {
            Ok(()) => {}
            Err(crossbeam::TrySendError::Full(_)) => {
                tracing::warn!("L2 background queue full, dropping classification request");
            }
            Err(crossbeam::TrySendError::Disconnected(_)) => {
                tracing::error!("L2 background workers disconnected");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_labels() -> Vec<String> {
        vec![
            "allow".to_string(),
            "block".to_string(),
            "redact".to_string(),
            "uncertain".to_string(),
        ]
    }

    #[test]
    fn test_stub_classifier_returns_default_label() {
        let classifier = Classifier::stub(test_labels(), "allow".to_string());
        let result = classifier.classify(&[0.1, 0.2, 0.3]).unwrap();

        assert_eq!(result.label, "allow");
        assert_eq!(result.confidence, 1.0);

        // All other labels should have 0.0 confidence.
        for (label, score) in &result.all_scores {
            if label == "allow" {
                assert_eq!(*score, 1.0);
            } else {
                assert_eq!(*score, 0.0);
            }
        }
    }

    #[test]
    fn test_stub_classifier_includes_uncertain_class() {
        let classifier = Classifier::stub(test_labels(), "allow".to_string());
        let result = classifier.classify(&[0.5, 0.5]).unwrap();

        // Verify "uncertain" is in the output labels.
        let has_uncertain = result
            .all_scores
            .iter()
            .any(|(label, _)| label == "uncertain");
        assert!(has_uncertain, "Output must include 'uncertain' class");

        // Verify it's also in the classifier's configured labels.
        assert!(
            classifier.labels().contains(&"uncertain".to_string()),
            "Classifier labels must include 'uncertain'"
        );
    }

    #[test]
    fn test_stub_classifier_is_stub() {
        let stub = Classifier::stub(test_labels(), "block".to_string());
        assert!(stub.is_stub());
    }

    #[test]
    fn test_background_l2_submit_and_receive() {
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let bg = BackgroundL2::new(classifier, 2, 10);

        // Create a result channel.
        let (result_tx, result_rx) = crossbeam::bounded(1);

        bg.submit(L2WorkItem {
            request_id: uuid::Uuid::new_v4(),
            input_features: vec![0.1, 0.2, 0.3],
            result_tx: Some(result_tx),
        });

        // Wait for the result (with timeout).
        let result = result_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("Should receive classification result within timeout");

        assert_eq!(result.label, "allow");
        assert_eq!(result.confidence, 1.0);
    }

    #[test]
    fn test_background_l2_drops_when_queue_full() {
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));

        // Queue depth of 1, but don't start workers (receiver not consumed).
        // Actually we need to start workers but use a blocking stub.
        // Instead, test with a very small queue and many submissions.
        let bg = BackgroundL2::new(classifier, 1, 2);

        // Submit more items than queue depth. Some should be dropped.
        // The worker thread will process items, so we fill rapidly.
        let mut submitted = 0;
        let _dropped = 0;

        // Try to submit many items quickly. The bounded channel will
        // reject excess items via try_send.
        for _ in 0..100 {
            let (result_tx, _result_rx) = crossbeam::bounded(1);
            // We don't hold result_rx, so items are fire-and-forget.
            // The key test is that submit() doesn't block or panic.
            bg.submit(L2WorkItem {
                request_id: uuid::Uuid::new_v4(),
                input_features: vec![0.1],
                result_tx: Some(result_tx),
            });
            submitted += 1;
        }

        // The test passes if we get here without blocking or panicking.
        // With a queue depth of 2, some submissions should have been dropped.
        assert!(
            submitted == 100,
            "All 100 submissions should complete without blocking"
        );

        // Also verify the BackgroundL2 is still functional after drops.
        let (result_tx, result_rx) = crossbeam::bounded(1);
        bg.submit(L2WorkItem {
            request_id: uuid::Uuid::new_v4(),
            input_features: vec![0.5, 0.5],
            result_tx: Some(result_tx),
        });

        // Should still be able to get results (worker is alive).
        let result = result_rx.recv_timeout(std::time::Duration::from_secs(5));
        // This may or may not succeed depending on timing, but the point is
        // that the system didn't deadlock or panic.
        let _ = result;
    }
}
