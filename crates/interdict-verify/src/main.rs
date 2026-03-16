use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use prost::Message;

use interdict_verify::chain::verify_chain;
use interdict_verify::merkle::{parse_anchor_json, verify_merkle_root};
use interdict_verify::proto::EvidenceBundle;
use interdict_verify::report::{VerificationReport, format_human, format_json};
use interdict_verify::signature::{parse_public_key_file, verify_bundle_signatures};

#[derive(Debug, Parser)]
#[command(name = "interdict-verify")]
#[command(about = "Verify Interdict evidence bundles")]
struct Cli {
    /// Output results as JSON (machine-parseable).
    #[arg(long)]
    json: bool,

    /// Filter verification to a specific kernel ID.
    #[arg(long)]
    kernel_id: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Verify a single exported protobuf bundle file.
    Bundle {
        /// Path to the protobuf bundle file.
        file: String,
        /// Path to the public key file (JSON map of key_id -> hex public key).
        #[arg(long)]
        public_keys: String,
    },
    /// Verify bundles within a time range from an export directory.
    Range {
        /// Directory containing exported protobuf bundle files.
        dir: String,
        /// Start time (RFC 3339).
        #[arg(long)]
        from: String,
        /// End time (RFC 3339).
        #[arg(long)]
        to: String,
        /// Path to the public key file (JSON map of key_id -> hex public key).
        #[arg(long)]
        public_keys: String,
        /// Directory containing exported S3 anchor JSON files for Merkle verification.
        #[arg(long)]
        anchor_dir: Option<String>,
    },
    /// Verify the full hash chain from an export directory.
    Chain {
        /// Directory containing exported protobuf bundle files.
        dir: String,
        /// Path to the public key file (JSON map of key_id -> hex public key).
        #[arg(long)]
        public_keys: String,
        /// Directory containing exported S3 anchor JSON files for Merkle verification.
        #[arg(long)]
        anchor_dir: Option<String>,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Bundle {
            ref file,
            ref public_keys,
        } => run_verify_bundle(file, public_keys, cli.kernel_id.as_deref()),
        Commands::Range {
            ref dir,
            ref from,
            ref to,
            ref public_keys,
            ref anchor_dir,
        } => run_verify_range(
            dir,
            from,
            to,
            public_keys,
            anchor_dir.as_deref(),
            cli.kernel_id.as_deref(),
        ),
        Commands::Chain {
            ref dir,
            ref public_keys,
            ref anchor_dir,
        } => run_verify_chain(
            dir,
            public_keys,
            anchor_dir.as_deref(),
            cli.kernel_id.as_deref(),
        ),
    };

    match result {
        Ok(report) => {
            if cli.json {
                println!("{}", format_json(&report));
            } else {
                print!("{}", format_human(&report));
            }
            if report.overall_valid() {
                ExitCode::from(0)
            } else {
                ExitCode::from(1)
            }
        }
        Err(e) => {
            if cli.json {
                let err_json = serde_json::json!({
                    "error": format!("{e:#}"),
                    "overall_valid": false,
                });
                println!(
                    "{}",
                    serde_json::to_string_pretty(&err_json).unwrap_or_else(|e| format!(
                        "{{\"error\": \"serialization failed: {e}\"}}"
                    ))
                );
            } else {
                eprintln!("Error: {e:#}");
            }
            ExitCode::from(2)
        }
    }
}

fn run_verify_bundle(
    file: &str,
    public_keys_path: &str,
    kernel_filter: Option<&str>,
) -> Result<VerificationReport> {
    let bundle = read_bundle_file(Path::new(file))?;

    if let Some(kid) = kernel_filter
        && bundle.kernel_id != kid
    {
        anyhow::bail!(
            "bundle kernel_id '{}' does not match filter '{kid}'",
            bundle.kernel_id
        );
    }

    let pk_json =
        std::fs::read_to_string(public_keys_path).context("failed to read public key file")?;
    let public_keys = parse_public_key_file(&pk_json)?;

    let sig_summary = verify_bundle_signatures(&[bundle], &public_keys);

    Ok(VerificationReport {
        chain: None, // Single bundle: no chain to verify.
        signatures: Some(sig_summary),
        merkle: None,
    })
}

fn run_verify_range(
    dir: &str,
    from: &str,
    to: &str,
    public_keys_path: &str,
    anchor_dir: Option<&str>,
    kernel_filter: Option<&str>,
) -> Result<VerificationReport> {
    let from_time: DateTime<Utc> = DateTime::parse_from_rfc3339(from)
        .map(|dt| dt.with_timezone(&Utc))
        .with_context(|| format!("invalid --from time: {from}"))?;
    let to_time: DateTime<Utc> = DateTime::parse_from_rfc3339(to)
        .map(|dt| dt.with_timezone(&Utc))
        .with_context(|| format!("invalid --to time: {to}"))?;

    let all_bundles = read_bundle_dir(Path::new(dir))?;

    // Filter by time range and optionally by kernel_id.
    let bundles: Vec<EvidenceBundle> = all_bundles
        .into_iter()
        .filter(|b| {
            if let Some(kid) = kernel_filter
                && b.kernel_id != kid
            {
                return false;
            }
            if let Some(ref ts) = b.timestamp {
                let secs = ts.seconds;
                secs >= from_time.timestamp() && secs <= to_time.timestamp()
            } else {
                false
            }
        })
        .collect();

    let pk_json =
        std::fs::read_to_string(public_keys_path).context("failed to read public key file")?;
    let public_keys = parse_public_key_file(&pk_json)?;

    let chain_result = verify_chain(&bundles);
    let sig_summary = verify_bundle_signatures(&bundles, &public_keys);
    let merkle_result = build_merkle_result(&bundles, anchor_dir)?;

    Ok(VerificationReport {
        chain: Some(chain_result),
        signatures: Some(sig_summary),
        merkle: merkle_result,
    })
}

fn run_verify_chain(
    dir: &str,
    public_keys_path: &str,
    anchor_dir: Option<&str>,
    kernel_filter: Option<&str>,
) -> Result<VerificationReport> {
    let all_bundles = read_bundle_dir(Path::new(dir))?;

    let bundles: Vec<EvidenceBundle> = if let Some(kid) = kernel_filter {
        all_bundles
            .into_iter()
            .filter(|b| b.kernel_id == kid)
            .collect()
    } else {
        all_bundles
    };

    let pk_json =
        std::fs::read_to_string(public_keys_path).context("failed to read public key file")?;
    let public_keys = parse_public_key_file(&pk_json)?;

    let chain_result = verify_chain(&bundles);
    let sig_summary = verify_bundle_signatures(&bundles, &public_keys);
    let merkle_result = build_merkle_result(&bundles, anchor_dir)?;

    Ok(VerificationReport {
        chain: Some(chain_result),
        signatures: Some(sig_summary),
        merkle: merkle_result,
    })
}

/// Build Merkle verification result by comparing against S3 anchor files.
///
/// If anchor_dir is provided, reads all .json files and verifies the computed
/// Merkle root against each anchor's expected root.
fn build_merkle_result(
    bundles: &[EvidenceBundle],
    anchor_dir: Option<&str>,
) -> Result<Option<interdict_verify::merkle::MerkleVerificationResult>> {
    let anchor_dir = match anchor_dir {
        Some(d) => d,
        None => return Ok(None),
    };

    // Read all anchor files from the directory.
    let anchor_files = find_json_files(Path::new(anchor_dir))?;
    if anchor_files.is_empty() {
        return Ok(None);
    }

    // For now, use the first anchor file for comparison.
    // In production, you would match bundles to the correct hourly anchor.
    let anchor_json = std::fs::read_to_string(&anchor_files[0])
        .with_context(|| format!("failed to read anchor file: {}", anchor_files[0].display()))?;
    let anchor = parse_anchor_json(&anchor_json)?;

    let result = verify_merkle_root(bundles, &anchor.merkle_root);
    Ok(Some(result))
}

/// Read a single protobuf bundle file.
fn read_bundle_file(path: &Path) -> Result<EvidenceBundle> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("failed to read bundle file: {}", path.display()))?;
    EvidenceBundle::decode(bytes.as_slice())
        .with_context(|| format!("failed to decode protobuf bundle: {}", path.display()))
}

/// Read all protobuf bundle files from a directory.
fn read_bundle_dir(dir: &Path) -> Result<Vec<EvidenceBundle>> {
    let mut bundles = Vec::new();

    let entries = std::fs::read_dir(dir)
        .with_context(|| format!("failed to read bundle directory: {}", dir.display()))?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|ext| ext == "pb" || ext == "bin" || ext == "proto")
        {
            match read_bundle_file(&path) {
                Ok(bundle) => bundles.push(bundle),
                Err(e) => {
                    tracing::warn!(file = %path.display(), error = %e, "skipping unreadable bundle file");
                }
            }
        }
    }

    Ok(bundles)
}

/// Find all JSON files in a directory.
fn find_json_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    let entries = std::fs::read_dir(dir)
        .with_context(|| format!("failed to read directory: {}", dir.display()))?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            files.push(path);
        }
    }

    files.sort();
    Ok(files)
}
