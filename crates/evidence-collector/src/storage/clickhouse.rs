use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Datelike, Utc};
use clickhouse::{Client, Compression, Row, inserter::Inserter};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, mpsc, oneshot};

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
}

impl EvidenceRow {
    pub fn from_timestamp(ts: DateTime<Utc>) -> String {
        format!("{:04}-{:02}-{:02}", ts.year(), ts.month(), ts.day())
    }
}

enum WriteCommand {
    Row(Box<EvidenceRow>),
    Flush(oneshot::Sender<Result<()>>),
}

pub struct ClickHouseWriter {
    sender: mpsc::Sender<WriteCommand>,
    worker: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl ClickHouseWriter {
    pub async fn new(url: &str, database: &str) -> Result<Self> {
        let client = Client::default()
            .with_url(url)
            .with_database(database)
            .with_compression(Compression::Lz4);

        initialize_schema(&client).await?;

        let inserter = client
            .inserter::<EvidenceRow>(EVIDENCE_TABLE)
            .with_max_rows(1000)
            .with_period(Some(std::time::Duration::from_secs(1)))
            .with_max_bytes(50_000_000);

        let (sender, receiver) = mpsc::channel(8_192);
        let worker = tokio::spawn(run_inserter_worker(receiver, inserter));

        Ok(Self {
            sender,
            worker: Mutex::new(Some(worker)),
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
}

async fn run_inserter_worker(
    mut receiver: mpsc::Receiver<WriteCommand>,
    mut inserter: Inserter<EvidenceRow>,
) {
    while let Some(command) = receiver.recv().await {
        match command {
            WriteCommand::Row(row) => {
                if let Err(error) = inserter.write(&row).await {
                    tracing::error!(error = %error, "failed to enqueue evidence row into clickhouse inserter");
                    continue;
                }

                if let Err(error) = inserter.commit().await {
                    tracing::error!(error = %error, "failed to commit evidence row into clickhouse inserter");
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

async fn initialize_schema(client: &Client) -> Result<()> {
    client
        .query(&table_ddl())
        .execute()
        .await
        .context("failed creating evidence_bundles table")?;

    for view in materialized_view_ddls() {
        client
            .query(&view)
            .execute()
            .await
            .context("failed creating clickhouse materialized view")?;
    }

    Ok(())
}

pub fn table_ddl() -> String {
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
schema_version UInt32 DEFAULT 1
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(event_date)
ORDER BY (kernel_id, sequence_number)
TTL event_date + INTERVAL 7 YEAR DELETE
SETTINGS index_granularity = 8192"
        .to_string()
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
    use super::{EvidenceRow, table_ddl};
    use chrono::{TimeZone, Utc};

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
        };

        let encoded = serde_json::to_string(&row).expect("serialize row");
        let decoded: EvidenceRow = serde_json::from_str(&encoded).expect("deserialize row");
        assert_eq!(row, decoded);
    }

    #[test]
    fn schema_ddl_contains_core_clauses() {
        let ddl = table_ddl();
        assert!(ddl.starts_with("CREATE TABLE IF NOT EXISTS evidence_bundles"));
        assert!(ddl.contains("PARTITION BY toYYYYMMDD(event_date)"));
        assert!(ddl.contains("TTL event_date + INTERVAL 7 YEAR DELETE"));
        assert!(ddl.contains("ORDER BY (kernel_id, sequence_number)"));
    }
}
