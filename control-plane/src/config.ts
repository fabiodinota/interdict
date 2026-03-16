/**
 * Control Plane Configuration
 *
 * Loads and validates environment variables at startup.
 * Checks for required vars and warns about optional dependencies.
 */

export interface Config {
  port: number;
  databaseUrl: string;
  clickhouseUrl: string;
  clickhouseDatabase: string;
  clickhouseUser: string;
  clickhousePassword: string;
  wasmStorageDir: string;
  opaBinaryPath: string;
  grpcPort: number;
  grpcMaxMessageSize: number;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function checkOpaBinary(path: string): void {
  const resolved = Bun.which(path);
  if (!resolved) {
    console.warn(
      `[config] WARNING: OPA binary not found in PATH (searched for '${path}'). ` +
        `Policy compilation will fail until OPA is installed. ` +
        `Install from https://www.openpolicyagent.org/docs/latest/#running-opa`,
    );
  } else {
    console.log(`[config] OPA binary found at: ${resolved}`);
  }
}

export function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === "production";
  const allowDevDefaults =
    !isProduction && process.env.ALLOW_DEV_DEFAULTS === "true";

  function devFallback(value: string): string | undefined {
    return allowDevDefaults ? value : undefined;
  }

  const config: Config = {
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: requireEnv(
      "DATABASE_URL",
      devFallback("postgres://interdict:interdict@localhost:5432/interdict"),
    ),
    clickhouseUrl: requireEnv("CLICKHOUSE_URL", devFallback("http://localhost:8123")),
    clickhouseDatabase: requireEnv("CLICKHOUSE_DATABASE", devFallback("interdict")),
    clickhouseUser: process.env.CLICKHOUSE_USER ?? "default",
    clickhousePassword: process.env.CLICKHOUSE_PASSWORD ?? "",
    wasmStorageDir: requireEnv("WASM_STORAGE_DIR", devFallback("./data/wasm")),
    opaBinaryPath: requireEnv("OPA_BINARY_PATH", devFallback("opa")),
    grpcPort: parseInt(process.env.INTERDICT_GRPC_PORT ?? "50052", 10),
    grpcMaxMessageSize: parseInt(
      process.env.INTERDICT_GRPC_MAX_MESSAGE_SIZE ?? String(16 * 1024 * 1024),
      10,
    ),
  };

  if (Number.isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  if (Number.isNaN(config.grpcPort) || config.grpcPort < 1 || config.grpcPort > 65535) {
    throw new Error(`Invalid INTERDICT_GRPC_PORT value: ${process.env.INTERDICT_GRPC_PORT}`);
  }

  if (isProduction && !config.clickhousePassword) {
    console.warn(
      "[config] WARNING: ClickHouse password is empty in production mode. Set CLICKHOUSE_PASSWORD in .env.",
    );
  }

  checkOpaBinary(config.opaBinaryPath);

  return config;
}

/** Singleton config instance, loaded once at startup */
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
