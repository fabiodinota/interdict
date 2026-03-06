/**
 * ClickHouse Client Singleton
 *
 * Read-only access to evidence_bundles and materialized views.
 * The evidence-collector Rust service manages the ClickHouse schema;
 * the control plane only reads from it.
 */

import { createClient } from "@clickhouse/client";
import { getConfig } from "../config";

const config = getConfig();

/** ClickHouse client for audit trail queries */
export const clickhouse = createClient({
  url: config.clickhouseUrl,
  database: config.clickhouseDatabase,
  username: config.clickhouseUser,
  password: config.clickhousePassword,
  request_timeout: 30_000,
  clickhouse_settings: {
    max_execution_time: 30,
  },
});
