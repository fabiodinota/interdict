use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Datelike, Utc};
use clickhouse::{Client, Compression, Row, inserter::Inserter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};
use tokio::sync::{Mutex, mpsc, oneshot};

use super::dead_letter::write_dead_letter;

const EVIDENCE_TABLE: &str = "evidence_bundles";

#[derive(Debug, Clone, Row, Serialize, Deserialize, PartialEq, Eq)]
pub struct EvidenceRow {
    pub event_date: String,
    pub timestamp: i64,
    pub bundle_id: String,
    pub kernel_id: String,
    pub actor_identity: String,
    pub department: String,
    pub vendor: String,
    pub model: String,
    pub prompt_hash: String,
    pub response_hash: String,
    pub prompt_text: String,
    pub response_text: String,
    pub policy_action: String,
    pub policy_rules_json: String,
    pub token_count: u32,
    pub enforcement_latency_us: u64,
    pub chain_hash: String,
    pub previous_hash: String,
    pub sequence_number: u64,
    pub signature: String,
    pub signing_key_id: String,
    pub dev_signed: u8,
    pub schema_version: u32,
    /// Hex-encoded protobuf content bytes (bundle with chain/sig fields zeroed).
    /// Enables the control plane to perform full signature and chain-hash
    /// verification identical to the Rust `interdict-verify` tool.
    pub content_bytes: String,
}

impl EvidenceRow {
    pub fn from_timestamp(ts: DateTime<Utc>) -> String {
        format!("{:04}-{:02}-{:02}", ts.year(), ts.month(), ts.day())
    }
}

/// Atomic counters tracking the health of the ClickHouse writer pipeline.
///
/// All counters use `Relaxed` ordering — they are monotonic statistics
/// counters read by Prometheus scrapes, not synchronization primitives.
pub struct WriterHealth {
    pub rows_written: AtomicU64,
    pub rows_retried: AtomicU64,
    pub rows_dead_lettered: AtomicU64,
}

impl WriterHealth {
    pub fn new() -> Self {
        Self {
            rows_written: AtomicU64::new(0),
            rows_retried: AtomicU64::new(0),
            rows_dead_lettered: AtomicU64::new(0),
        }
    }

    pub fn increment_written(&self, count: u64) {
        self.rows_written.fetch_add(count, Relaxed);
    }

    pub fn increment_retried(&self, count: u64) {
        self.rows_retried.fetch_add(count, Relaxed);
    }

    pub fn increment_dead_lettered(&self, count: u64) {
        self.rows_dead_lettered.fetch_add(count, Relaxed);
    }
}

impl Default for WriterHealth {
    fn default() -> Self {
        Self::new()
    }
}

/// Configurable batch settings for the ClickHouse inserter.
#[derive(Debug, Clone, Copy)]
pub struct InserterBatchSettings {
    pub max_rows: u64,
    pub period_ms: u64,
    pub max_bytes: u64,
}

impl Default for InserterBatchSettings {
    fn default() -> Self {
        Self {
            max_rows: 1000,
            period_ms: 1000,
            max_bytes: 52_428_800,
        }
    }
}

enum WriteCommand {
    Row(Box<EvidenceRow>),
    Flush(oneshot::Sender<Result<()>>),
}

pub struct ClickHouseWriter {
    sender: mpsc::Sender<WriteCommand>,
    worker: Mutex<Option<tokio::task::JoinHandle<()>>>,
    health: Arc<WriterHealth>,
}

impl ClickHouseWriter {
    pub async fn new(
        url: &str,
        database: &str,
        user: &str,
        password: &str,
        data_dir: PathBuf,
        retention_days: u32,
        batch: InserterBatchSettings,
    ) -> Result<Self> {
        let database =
            validate_clickhouse_identifier(database).context("invalid ClickHouse database name")?;

        // Create the database first using a client without database set
        let bootstrap = Client::default()
            .with_url(url)
            .with_user(user)
            .with_password(password);
        bootstrap
            .query(&format!("CREATE DATABASE IF NOT EXISTS {database}"))
            .execute()
            .await
            .context("failed creating clickhouse database")?;

        let client = Client::default()
            .with_url(url)
            .with_user(user)
            .with_password(password)
            .with_database(database)
            .with_compression(Compression::Lz4);

        initialize_schema(&client, retention_days).await?;

        let inserter = client
            .inserter::<EvidenceRow>(EVIDENCE_TABLE)
            .with_max_rows(batch.max_rows)
            .with_period(Some(std::time::Duration::from_millis(batch.period_ms)))
            .with_max_bytes(batch.max_bytes);

        let (sender, receiver) = mpsc::channel(8_192);
        let health = Arc::new(WriterHealth::new());
        let worker = tokio::spawn(run_inserter_worker(
            receiver,
            inserter,
            Arc::clone(&health),
            data_dir,
        ));

        Ok(Self {
            sender,
            worker: Mutex::new(Some(worker)),
            health,
        })
    }

    pub async fn write(&self, row: EvidenceRow) -> Result<()> {
        self.sender
            .send(WriteCommand::Row(Box::new(row)))
            .await
            .map_err(|_| anyhow!("clickhouse writer channel closed"))
    }

    pub async fn flush(&self) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(WriteCommand::Flush(tx))
            .await
            .map_err(|_| anyhow!("failed to request clickhouse flush"))?;

        rx.await
            .map_err(|_| anyhow!("clickhouse flush response dropped"))??;

        if let Some(handle) = self.worker.lock().await.take() {
            handle
                .await
                .map_err(|e| anyhow!("clickhouse worker task failed: {e}"))?;
        }

        Ok(())
    }

    /// Returns a reference to the shared health counters for this writer.
    ///
    /// Used by the metrics layer (S06) to expose Prometheus gauges for
    /// `rows_written`, `rows_retried`, and `rows_dead_lettered`.
    pub fn health(&self) -> &Arc<WriterHealth> {
        &self.health
    }
}

fn validate_clickhouse_identifier(name: &str) -> Result<&str> {
    if name.is_empty() || name.len() > 128 {
        return Err(anyhow!(
            "database name must be between 1 and 128 characters"
        ));
    }

    if !name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(anyhow!(
            "database name may only contain ASCII letters, digits, and underscores"
        ));
    }

    Ok(name)
}

async fn run_inserter_worker(
    mut receiver: mpsc::Receiver<WriteCommand>,
    mut inserter: Inserter<EvidenceRow>,
    health: Arc<WriterHealth>,
    data_dir: PathBuf,
) {
    // Buffer of rows written since the last successful commit. When commit()
    // fails and retries are exhausted, these rows are spilled to dead-letter
    // files as a safety net (the inserter's internal buffer may be lost).
    let mut pending_rows: Vec<EvidenceRow> = Vec::new();

    while let Some(command) = receiver.recv().await {
        match command {
            WriteCommand::Row(row) => {
                // Keep a clone for dead-lettering before the row enters the
                // inserter's internal buffer (which may be lost on failure).
                pending_rows.push(*row.clone());

                if let Err(error) = inserter.write(&row).await {
                    tracing::error!(error = %error, "failed to enqueue evidence row into clickhouse inserter");
                    continue;
                }

                match commit_with_retry(&mut inserter, &health).await {
                    Ok(()) => {
                        let count = pending_rows.len() as u64;
                        health.increment_written(count);
                        pending_rows.clear();
                    }
                    Err(error) => {
                        tracing::error!(
                            error = %error,
                            pending_count = pending_rows.len(),
                            "all retry attempts exhausted; spilling to dead-letter"
                        );
                        for dead_row in &pending_rows {
                            health.increment_dead_lettered(1);
                            if let Err(dl_err) =
                                write_dead_letter(&data_dir, &dead_row.bundle_id, dead_row).await
                            {
                                tracing::error!(
                                    error = %dl_err,
                                    bundle_id = %dead_row.bundle_id,
                                    "failed to write dead-letter file"
                                );
                            }
                        }
                        pending_rows.clear();
                    }
                }
            }
            WriteCommand::Flush(respond_to) => {
                let result = inserter
                    .end()
                    .await
                    .map(|_| ())
                    .map_err(|e| anyhow!("failed to flush clickhouse inserter: {e}"));
                let _ = respond_to.send(result);
                break;
            }
        }
    }
}

/// Maximum number of retry attempts for a failed `commit()`.
const MAX_RETRY_ATTEMPTS: u32 = 5;

/// Base backoff duration in milliseconds (doubled each attempt, capped at 5 s).
const BASE_BACKOFF_MS: u64 = 200;

/// Maximum backoff duration in milliseconds.
const MAX_BACKOFF_MS: u64 = 5_000;

/// Attempts to commit the inserter's pending rows with exponential backoff.
///
/// On success, returns `Ok(())`. On exhaustion of all attempts, returns the
/// last error. Each retry attempt is tracked in `WriterHealth::rows_retried`.
///
/// This is factored out to enable unit-testing the retry logic independently
/// via `retry_with_backoff`.
async fn commit_with_retry(
    inserter: &mut Inserter<EvidenceRow>,
    health: &WriterHealth,
) -> Result<()> {
    // First attempt (not counted as a retry).
    match inserter.commit().await {
        Ok(_) => Ok(()),
        Err(first_error) => {
            tracing::warn!(
                error = %first_error,
                "ClickHouse commit failed; starting retry sequence"
            );

            let mut last_error = first_error;

            for attempt in 1..=MAX_RETRY_ATTEMPTS {
                let backoff_ms = (BASE_BACKOFF_MS * 2u64.pow(attempt - 1)).min(MAX_BACKOFF_MS);

                health.increment_retried(1);

                tracing::warn!(
                    attempt = attempt,
                    max_attempts = MAX_RETRY_ATTEMPTS,
                    backoff_ms = backoff_ms,
                    error = %last_error,
                    "retrying ClickHouse commit"
                );

                tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;

                match inserter.commit().await {
                    Ok(_) => {
                        tracing::info!(
                            attempt = attempt,
                            "ClickHouse commit succeeded after retry"
                        );
                        return Ok(());
                    }
                    Err(err) => {
                        last_error = err;
                    }
                }
            }

            Err(anyhow::Error::from(last_error)
                .context("ClickHouse commit failed after all retry attempts"))
        }
    }
}

/// Testable retry loop that accepts a fallible async closure instead of a real
/// inserter. Returns `Ok(())` on success, `Err` with dead-letter spill on
/// exhaustion.
///
/// This function is `pub(crate)` so tests can exercise the backoff logic
/// without requiring a ClickHouse connection.
#[cfg(test)]
pub(crate) async fn retry_with_backoff<F, Fut>(
    mut commit_fn: F,
    health: &WriterHealth,
    data_dir: &std::path::Path,
    rows: &[EvidenceRow],
) -> Result<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<()>>,
{
    // First attempt.
    match commit_fn().await {
        Ok(()) => {
            health.increment_written(rows.len() as u64);
            Ok(())
        }
        Err(first_error) => {
            let mut last_error = first_error;

            for attempt in 1..=MAX_RETRY_ATTEMPTS {
                let backoff_ms = (BASE_BACKOFF_MS * 2u64.pow(attempt - 1)).min(MAX_BACKOFF_MS);

                health.increment_retried(1);

                tracing::warn!(
                    attempt = attempt,
                    max_attempts = MAX_RETRY_ATTEMPTS,
                    backoff_ms = backoff_ms,
                    error = %last_error,
                    "retrying commit"
                );

                tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;

                match commit_fn().await {
                    Ok(()) => {
                        health.increment_written(rows.len() as u64);
                        tracing::info!(attempt = attempt, "commit succeeded after retry");
                        return Ok(());
                    }
                    Err(err) => {
                        last_error = err;
                    }
                }
            }

            // All retries exhausted — dead-letter every row.
            for row in rows {
                health.increment_dead_lettered(1);
                if let Err(dl_err) = write_dead_letter(data_dir, &row.bundle_id, row).await {
                    tracing::error!(
                        error = %dl_err,
                        bundle_id = %row.bundle_id,
                        "failed to write dead-letter file"
                    );
                }
            }

            Err(last_error.context("commit failed after all retry attempts"))
        }
    }
}

async fn initialize_schema(client: &Client, retention_days: u32) -> Result<()> {
    client
        .query(&table_ddl(retention_days))
        .execute()
        .await
        .context("failed creating evidence_bundles table")?;

    // Run schema migrations (safe to re-run; uses ADD COLUMN IF NOT EXISTS).
    for ddl in migration_ddls() {
        client
            .query(&ddl)
            .execute()
            .await
            .context("failed running clickhouse schema migration")?;
    }

    for view in materialized_view_ddls() {
        client
            .query(&view)
            .execute()
            .await
            .context("failed creating clickhouse materialized view")?;
    }

    Ok(())
}

pub fn table_ddl(retention_days: u32) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS evidence_bundles (
event_date Date DEFAULT toDate(timestamp),
timestamp DateTime64(3),
bundle_id String,
kernel_id String,
actor_identity String,
department LowCardinality(String),
vendor LowCardinality(String),
model LowCardinality(String),
prompt_hash String,
response_hash String,
prompt_text String DEFAULT '',
response_text String DEFAULT '',
policy_action LowCardinality(String),
policy_rules_json String,
token_count UInt32,
enforcement_latency_us UInt64,
chain_hash String,
previous_hash String,
sequence_number UInt64,
signature String,
signing_key_id String,
dev_signed UInt8 DEFAULT 0,
schema_version UInt32 DEFAULT 1,
content_bytes String DEFAULT ''
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(event_date)
ORDER BY (kernel_id, sequence_number)
TTL event_date + INTERVAL {retention_days} DAY DELETE
SETTINGS index_granularity = 8192"
    )
}

/// Returns DDL statements to add columns introduced after the initial schema.
/// These use ALTER TABLE ... ADD COLUMN IF NOT EXISTS so they are safe to run
/// on already-upgraded tables.
pub fn migration_ddls() -> Vec<String> {
    vec![
        "ALTER TABLE evidence_bundles ADD COLUMN IF NOT EXISTS content_bytes String DEFAULT ''"
            .to_string(),
    ]
}

pub fn materialized_view_ddls() -> [String; 3] {
    [
        "CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_violations ENGINE = SummingMergeTree PARTITION BY toYYYYMMDD(hour) ORDER BY (hour, policy_action) AS SELECT toStartOfHour(timestamp) AS hour, policy_action, count() AS violation_count, uniqExact(actor_identity) AS unique_actors, uniqExact(vendor) AS unique_vendors FROM evidence_bundles WHERE policy_action IN ('block', 'redact') GROUP BY hour, policy_action".to_string(),
        "CREATE MATERIALIZED VIEW IF NOT EXISTS mv_vendor_usage ENGINE = SummingMergeTree PARTITION BY toYYYYMMDD(hour) ORDER BY (hour, vendor, model) AS SELECT toStartOfHour(timestamp) AS hour, vendor, model, count() AS request_count, sum(token_count) AS total_tokens, avg(enforcement_latency_us) AS avg_latency_us FROM evidence_bundles GROUP BY hour, vendor, model".to_string(),
        "CREATE MATERIALIZED VIEW IF NOT EXISTS mv_department_summary ENGINE = SummingMergeTree PARTITION BY toYYYYMMDD(hour) ORDER BY (hour, department, policy_action) AS SELECT toStartOfHour(timestamp) AS hour, department, policy_action, count() AS action_count, uniqExact(actor_identity) AS unique_actors FROM evidence_bundles GROUP BY hour, department, policy_action".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::{EvidenceRow, WriterHealth, retry_with_backoff, table_ddl};
    use chrono::{TimeZone, Utc};
    use std::sync::atomic::Ordering::Relaxed;
    use std::sync::{Arc, Mutex as StdMutex};

    #[test]
    fn evidence_row_serialization_roundtrip() {
        let ts = Utc
            .with_ymd_and_hms(2026, 2, 28, 0, 0, 0)
            .single()
            .expect("timestamp");
        let row = EvidenceRow {
            event_date: EvidenceRow::from_timestamp(ts),
            timestamp: ts.timestamp_millis(),
            bundle_id: "bundle-1".to_string(),
            kernel_id: "kernel-1".to_string(),
            actor_identity: "analyst@example.com".to_string(),
            department: "fraud".to_string(),
            vendor: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            prompt_hash: "p".repeat(64),
            response_hash: "r".repeat(64),
            prompt_text: String::new(),
            response_text: String::new(),
            policy_action: "allow".to_string(),
            policy_rules_json: "[]".to_string(),
            token_count: 12,
            enforcement_latency_us: 100,
            chain_hash: "a".repeat(64),
            previous_hash: "0".repeat(64),
            sequence_number: 1,
            signature: "b".repeat(128),
            signing_key_id: "key-1".to_string(),
            dev_signed: 1,
            schema_version: 1,
            content_bytes: "deadbeef".to_string(),
        };

        let encoded = serde_json::to_string(&row).expect("serialize row");
        let decoded: EvidenceRow = serde_json::from_str(&encoded).expect("deserialize row");
        assert_eq!(row, decoded);
    }

    #[test]
    fn schema_ddl_contains_core_clauses() {
        let ddl = table_ddl(2555);
        assert!(ddl.starts_with("CREATE TABLE IF NOT EXISTS evidence_bundles"));
        assert!(ddl.contains("PARTITION BY toYYYYMMDD(event_date)"));
        assert!(ddl.contains("TTL event_date + INTERVAL 2555 DAY DELETE"));
        assert!(ddl.contains("ORDER BY (kernel_id, sequence_number)"));
        assert!(ddl.contains("content_bytes String DEFAULT ''"));
    }

    #[test]
    fn schema_ddl_contains_all_required_columns() {
        let ddl = table_ddl(2555);
        let required_columns = [
            "event_date",
            "timestamp",
            "bundle_id",
            "kernel_id",
            "actor_identity",
            "department",
            "vendor",
            "model",
            "prompt_hash",
            "response_hash",
            "prompt_text",
            "response_text",
            "policy_action",
            "policy_rules_json",
            "token_count",
            "enforcement_latency_us",
            "chain_hash",
            "previous_hash",
            "sequence_number",
            "signature",
            "signing_key_id",
            "dev_signed",
            "schema_version",
            "content_bytes",
        ];
        for col in &required_columns {
            assert!(ddl.contains(col), "DDL missing required column: {col}");
        }
    }

    #[test]
    fn schema_ddl_retention_days_configurable() {
        let ddl_30 = table_ddl(30);
        assert!(
            ddl_30.contains("INTERVAL 30 DAY DELETE"),
            "DDL should contain INTERVAL 30 DAY DELETE"
        );

        let ddl_2555 = table_ddl(2555);
        assert!(
            ddl_2555.contains("INTERVAL 2555 DAY DELETE"),
            "DDL should contain INTERVAL 2555 DAY DELETE"
        );

        let ddl_365 = table_ddl(365);
        assert!(
            ddl_365.contains("INTERVAL 365 DAY DELETE"),
            "DDL should contain INTERVAL 365 DAY DELETE"
        );
    }

    #[test]
    fn from_timestamp_formats_correctly() {
        let ts = Utc
            .with_ymd_and_hms(2026, 1, 5, 12, 30, 0)
            .single()
            .expect("timestamp");
        assert_eq!(EvidenceRow::from_timestamp(ts), "2026-01-05");
    }

    #[test]
    fn from_timestamp_handles_leap_day() {
        let ts = Utc
            .with_ymd_and_hms(2028, 2, 29, 0, 0, 0)
            .single()
            .expect("leap day");
        assert_eq!(EvidenceRow::from_timestamp(ts), "2028-02-29");
    }

    #[test]
    fn validate_identifier_rejects_empty() {
        assert!(super::validate_clickhouse_identifier("").is_err());
    }

    #[test]
    fn validate_identifier_rejects_special_chars() {
        assert!(super::validate_clickhouse_identifier("db; DROP TABLE").is_err());
        assert!(super::validate_clickhouse_identifier("db-name").is_err());
        assert!(super::validate_clickhouse_identifier("db.name").is_err());
    }

    #[test]
    fn validate_identifier_accepts_valid_names() {
        assert!(super::validate_clickhouse_identifier("evidence_db").is_ok());
        assert!(super::validate_clickhouse_identifier("DB_2026").is_ok());
        assert!(super::validate_clickhouse_identifier("a").is_ok());
    }

    #[test]
    fn validate_identifier_rejects_too_long() {
        let long = "a".repeat(129);
        assert!(super::validate_clickhouse_identifier(&long).is_err());
        // Exactly 128 is ok
        let max = "b".repeat(128);
        assert!(super::validate_clickhouse_identifier(&max).is_ok());
    }

    #[test]
    fn migration_ddls_are_idempotent() {
        for ddl in super::migration_ddls() {
            assert!(
                ddl.contains("IF NOT EXISTS"),
                "migration DDL must be idempotent: {ddl}"
            );
        }
    }

    #[test]
    fn materialized_views_are_idempotent() {
        for ddl in super::materialized_view_ddls() {
            assert!(
                ddl.contains("IF NOT EXISTS"),
                "materialized view DDL must be idempotent: {ddl}"
            );
        }
    }

    // -- WriterHealth tests --

    #[test]
    fn writer_health_counter_increments() {
        let health = WriterHealth::new();

        assert_eq!(health.rows_written.load(Relaxed), 0);
        assert_eq!(health.rows_retried.load(Relaxed), 0);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 0);

        health.increment_written(5);
        assert_eq!(health.rows_written.load(Relaxed), 5);

        health.increment_written(3);
        assert_eq!(health.rows_written.load(Relaxed), 8);

        health.increment_retried(2);
        assert_eq!(health.rows_retried.load(Relaxed), 2);

        health.increment_dead_lettered(1);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 1);

        health.increment_dead_lettered(1);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 2);
    }

    fn make_test_row(bundle_id: &str) -> EvidenceRow {
        let ts = Utc
            .with_ymd_and_hms(2026, 3, 15, 10, 30, 0)
            .single()
            .expect("timestamp");
        EvidenceRow {
            event_date: EvidenceRow::from_timestamp(ts),
            timestamp: ts.timestamp_millis(),
            bundle_id: bundle_id.to_string(),
            kernel_id: "kernel-1".to_string(),
            actor_identity: "analyst@example.com".to_string(),
            department: "fraud".to_string(),
            vendor: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            prompt_hash: "p".repeat(64),
            response_hash: "r".repeat(64),
            prompt_text: String::new(),
            response_text: String::new(),
            policy_action: "allow".to_string(),
            policy_rules_json: "[]".to_string(),
            token_count: 12,
            enforcement_latency_us: 100,
            chain_hash: "a".repeat(64),
            previous_hash: "0".repeat(64),
            sequence_number: 1,
            signature: "b".repeat(128),
            signing_key_id: "key-1".to_string(),
            dev_signed: 1,
            schema_version: 1,
            content_bytes: "deadbeef".to_string(),
        }
    }

    // -- Retry logic tests --

    #[tokio::test]
    async fn retry_succeeds_on_first_attempt() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let health = WriterHealth::new();
        let rows = vec![make_test_row("bundle-ok")];
        let call_count = Arc::new(StdMutex::new(0u32));

        let cc = Arc::clone(&call_count);
        let result = retry_with_backoff(
            || {
                let cc = Arc::clone(&cc);
                async move {
                    *cc.lock().unwrap() += 1;
                    Ok(())
                }
            },
            &health,
            tmp.path(),
            &rows,
        )
        .await;

        assert!(result.is_ok());
        assert_eq!(*call_count.lock().unwrap(), 1);
        assert_eq!(health.rows_written.load(Relaxed), 1);
        assert_eq!(health.rows_retried.load(Relaxed), 0);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 0);
    }

    #[tokio::test]
    async fn retry_succeeds_after_failures() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let health = WriterHealth::new();
        let rows = vec![make_test_row("bundle-retry")];
        let call_count = Arc::new(StdMutex::new(0u32));

        let cc = Arc::clone(&call_count);
        // Fail twice, then succeed on third call (= second retry).
        let result = retry_with_backoff(
            || {
                let cc = Arc::clone(&cc);
                async move {
                    let mut count = cc.lock().unwrap();
                    *count += 1;
                    if *count <= 2 {
                        anyhow::bail!("simulated failure #{}", *count);
                    }
                    Ok(())
                }
            },
            &health,
            tmp.path(),
            &rows,
        )
        .await;

        assert!(result.is_ok());
        assert_eq!(*call_count.lock().unwrap(), 3); // 1 initial + 2 retries
        assert_eq!(health.rows_written.load(Relaxed), 1);
        assert_eq!(health.rows_retried.load(Relaxed), 2);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 0);
    }

    #[tokio::test]
    async fn retry_exhaustion_creates_dead_letter() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let health = WriterHealth::new();
        let rows = vec![make_test_row("bundle-dl-1"), make_test_row("bundle-dl-2")];
        let call_count = Arc::new(StdMutex::new(0u32));

        let cc = Arc::clone(&call_count);
        // Always fail.
        let result = retry_with_backoff(
            || {
                let cc = Arc::clone(&cc);
                async move {
                    *cc.lock().unwrap() += 1;
                    anyhow::bail!("permanent failure");
                }
            },
            &health,
            tmp.path(),
            &rows,
        )
        .await;

        assert!(result.is_err());
        // 1 initial + 5 retries = 6 total calls
        assert_eq!(*call_count.lock().unwrap(), 6);
        assert_eq!(health.rows_written.load(Relaxed), 0);
        assert_eq!(health.rows_retried.load(Relaxed), 5);
        assert_eq!(health.rows_dead_lettered.load(Relaxed), 2);

        // Verify dead-letter files exist.
        let dl_dir = super::super::dead_letter::dead_letter_dir(tmp.path());
        let entries: Vec<_> = std::fs::read_dir(&dl_dir)
            .expect("read dead-letter dir")
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 2, "expected 2 dead-letter files");

        // Verify content of dead-letter files.
        for entry in &entries {
            let content = std::fs::read_to_string(entry.path()).expect("read dl file");
            let deserialized: EvidenceRow =
                serde_json::from_str(&content).expect("parse dead-letter");
            assert!(
                deserialized.bundle_id.starts_with("bundle-dl-"),
                "unexpected bundle_id: {}",
                deserialized.bundle_id
            );
        }
    }
}
