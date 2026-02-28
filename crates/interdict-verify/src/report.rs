use serde::Serialize;

use crate::chain::ChainVerificationResult;
use crate::merkle::MerkleVerificationResult;
use crate::signature::SignatureVerificationSummary;

/// Aggregated verification report combining chain, signature, and Merkle results.
#[derive(Debug, Clone)]
pub struct VerificationReport {
    pub chain: Option<ChainVerificationResult>,
    pub signatures: Option<SignatureVerificationSummary>,
    pub merkle: Option<MerkleVerificationResult>,
}

impl VerificationReport {
    pub fn overall_valid(&self) -> bool {
        let chain_ok = self.chain.as_ref().is_none_or(|c| c.valid);
        let sig_ok = self.signatures.as_ref().is_none_or(|s| s.valid);
        let merkle_ok = self.merkle.as_ref().is_none_or(|m| m.valid);
        chain_ok && sig_ok && merkle_ok
    }
}

/// Format a verification report as human-readable text.
pub fn format_human(report: &VerificationReport) -> String {
    let mut output = String::new();
    output.push_str("Evidence Verification Report\n");
    output.push_str("============================\n");

    if let Some(ref chain) = report.chain {
        let status = if chain.valid { "PASS" } else { "FAIL" };
        let kernel_count = chain.kernel_results.len();
        output.push_str(&format!(
            "Chain Integrity:    {status} ({} bundles across {kernel_count} kernel{})\n",
            chain.total_bundles_checked,
            if kernel_count == 1 { "" } else { "s" }
        ));

        if !chain.valid {
            for kr in &chain.kernel_results {
                if !kr.valid {
                    output.push_str(&format!(
                        "  - kernel '{}': FAIL at seq {} -- {}\n",
                        kr.kernel_id,
                        kr.first_invalid_sequence
                            .map_or("?".to_string(), |s| s.to_string()),
                        kr.error_detail.as_deref().unwrap_or("unknown error")
                    ));
                }
            }
        }
    } else {
        output.push_str("Chain Integrity:    SKIPPED\n");
    }

    if let Some(ref sigs) = report.signatures {
        let status = if sigs.valid { "PASS" } else { "FAIL" };
        output.push_str(&format!(
            "Ed25519 Signatures: {status} ({}/{} valid)\n",
            sigs.valid_count, sigs.total_checked
        ));

        if !sigs.valid {
            for r in &sigs.results {
                if !r.valid {
                    output.push_str(&format!(
                        "  - bundle '{}' (key '{}'): {}\n",
                        r.bundle_id,
                        r.key_id,
                        r.error_detail.as_deref().unwrap_or("verification failed")
                    ));
                }
            }
        }
    } else {
        output.push_str("Ed25519 Signatures: SKIPPED\n");
    }

    if let Some(ref merkle) = report.merkle {
        let status = if merkle.valid { "PASS" } else { "FAIL" };
        output.push_str(&format!(
            "Merkle Root:        {status} ({} leaves)\n",
            merkle.leaf_count
        ));

        if !merkle.valid {
            if let Some(ref detail) = merkle.error_detail {
                output.push_str(&format!("  - {detail}\n"));
            }
            if !merkle.computed_root.is_empty() {
                output.push_str(&format!("  - computed: {}\n", merkle.computed_root));
                output.push_str(&format!("  - expected: {}\n", merkle.expected_root));
            }
        }
    } else {
        output.push_str("Merkle Root:        SKIPPED\n");
    }

    let overall = if report.overall_valid() {
        "PASS"
    } else {
        "FAIL"
    };
    output.push_str(&format!("\nOverall: {overall}\n"));

    output
}

/// JSON-serializable verification report.
#[derive(Debug, Serialize)]
pub struct JsonReport {
    pub overall_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chain: Option<JsonChainResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signatures: Option<JsonSignatureResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merkle: Option<JsonMerkleResult>,
}

#[derive(Debug, Serialize)]
pub struct JsonChainResult {
    pub valid: bool,
    pub total_bundles_checked: usize,
    pub kernel_count: usize,
    pub kernels: Vec<JsonKernelResult>,
}

#[derive(Debug, Serialize)]
pub struct JsonKernelResult {
    pub kernel_id: String,
    pub valid: bool,
    pub bundles_checked: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_invalid_sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JsonSignatureResult {
    pub valid: bool,
    pub total_checked: usize,
    pub valid_count: usize,
    pub invalid_count: usize,
}

#[derive(Debug, Serialize)]
pub struct JsonMerkleResult {
    pub valid: bool,
    pub computed_root: String,
    pub expected_root: String,
    pub leaf_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_detail: Option<String>,
}

/// Format a verification report as JSON.
pub fn format_json(report: &VerificationReport) -> String {
    let json_report = JsonReport {
        overall_valid: report.overall_valid(),
        chain: report.chain.as_ref().map(|c| JsonChainResult {
            valid: c.valid,
            total_bundles_checked: c.total_bundles_checked,
            kernel_count: c.kernel_results.len(),
            kernels: c
                .kernel_results
                .iter()
                .map(|kr| JsonKernelResult {
                    kernel_id: kr.kernel_id.clone(),
                    valid: kr.valid,
                    bundles_checked: kr.bundles_checked,
                    first_invalid_sequence: kr.first_invalid_sequence,
                    error_detail: kr.error_detail.clone(),
                })
                .collect(),
        }),
        signatures: report.signatures.as_ref().map(|s| JsonSignatureResult {
            valid: s.valid,
            total_checked: s.total_checked,
            valid_count: s.valid_count,
            invalid_count: s.invalid_count,
        }),
        merkle: report.merkle.as_ref().map(|m| JsonMerkleResult {
            valid: m.valid,
            computed_root: m.computed_root.clone(),
            expected_root: m.expected_root.clone(),
            leaf_count: m.leaf_count,
            error_detail: m.error_detail.clone(),
        }),
    };

    serde_json::to_string_pretty(&json_report)
        .unwrap_or_else(|_| "{{\"error\":\"serialization failed\"}}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chain::{ChainVerificationResult, KernelChainResult};
    use crate::merkle::MerkleVerificationResult;
    use crate::signature::{SignatureVerificationResult, SignatureVerificationSummary};

    fn passing_report() -> VerificationReport {
        VerificationReport {
            chain: Some(ChainVerificationResult {
                valid: true,
                kernel_results: vec![KernelChainResult {
                    kernel_id: "kernel-1".to_string(),
                    valid: true,
                    bundles_checked: 100,
                    first_invalid_sequence: None,
                    error_detail: None,
                }],
                total_bundles_checked: 100,
            }),
            signatures: Some(SignatureVerificationSummary {
                valid: true,
                total_checked: 100,
                valid_count: 100,
                invalid_count: 0,
                results: Vec::new(),
            }),
            merkle: Some(MerkleVerificationResult {
                valid: true,
                computed_root: "aa".repeat(32),
                expected_root: "aa".repeat(32),
                leaf_count: 100,
                error_detail: None,
            }),
        }
    }

    fn failing_report() -> VerificationReport {
        VerificationReport {
            chain: Some(ChainVerificationResult {
                valid: false,
                kernel_results: vec![KernelChainResult {
                    kernel_id: "kernel-1".to_string(),
                    valid: false,
                    bundles_checked: 5,
                    first_invalid_sequence: Some(3),
                    error_detail: Some("chain_hash mismatch at seq 3".to_string()),
                }],
                total_bundles_checked: 5,
            }),
            signatures: Some(SignatureVerificationSummary {
                valid: false,
                total_checked: 10,
                valid_count: 8,
                invalid_count: 2,
                results: vec![SignatureVerificationResult {
                    bundle_id: "bad-bundle".to_string(),
                    valid: false,
                    key_id: "key-1".to_string(),
                    dev_signed: true,
                    error_detail: Some("tampered".to_string()),
                }],
            }),
            merkle: None,
        }
    }

    #[test]
    fn human_format_includes_pass() {
        let output = format_human(&passing_report());
        assert!(output.contains("PASS"));
        assert!(output.contains("Overall: PASS"));
        assert!(output.contains("100 bundles"));
    }

    #[test]
    fn human_format_includes_fail() {
        let output = format_human(&failing_report());
        assert!(output.contains("FAIL"));
        assert!(output.contains("Overall: FAIL"));
        assert!(output.contains("seq 3"));
    }

    #[test]
    fn json_format_is_valid_json() {
        let json_str = format_json(&passing_report());
        let parsed: serde_json::Value = serde_json::from_str(&json_str).expect("valid JSON");
        assert_eq!(parsed["overall_valid"], true);
        assert_eq!(parsed["chain"]["valid"], true);
        assert_eq!(parsed["signatures"]["valid"], true);
        assert_eq!(parsed["merkle"]["valid"], true);
    }

    #[test]
    fn json_format_fail_is_valid_json() {
        let json_str = format_json(&failing_report());
        let parsed: serde_json::Value = serde_json::from_str(&json_str).expect("valid JSON");
        assert_eq!(parsed["overall_valid"], false);
    }

    #[test]
    fn skipped_sections_shown_in_human_format() {
        let report = VerificationReport {
            chain: None,
            signatures: None,
            merkle: None,
        };
        let output = format_human(&report);
        assert!(output.contains("SKIPPED"));
        assert!(output.contains("Overall: PASS")); // No checks = pass.
    }
}
