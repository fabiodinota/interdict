#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Kernel Entrypoint
# ---------------------------------------------------------------------------
# 1. Set default env values for unset variables (used by envsubst)
# 2. Generate interdict.toml from template via envsubst (into /tmp for
#    read-only rootfs compatibility)
# 3. Auto-generate CA cert/key on first boot
# 4. Exec the kernel binary
# ---------------------------------------------------------------------------

# -- Kernel proxy settings --
: "${KERNEL_LISTEN_ADDR:=0.0.0.0:8443}"
: "${KERNEL_CONNECT_TIMEOUT_MS:=10000}"
: "${KERNEL_FIRST_BYTE_TIMEOUT_MS:=30000}"
: "${KERNEL_STREAM_TIMEOUT_MS:=300000}"
: "${KERNEL_MAX_REQUEST_QUEUE:=1024}"

# -- TLS paths --
: "${KERNEL_CA_CERT_PATH:=/data/certs/ca.crt}"
: "${KERNEL_CA_KEY_PATH:=/data/certs/ca.key}"

# -- Connection pool --
: "${KERNEL_POOL_MAX_CONNECTIONS:=4}"
: "${KERNEL_POOL_MAX_STREAMS:=100}"
: "${KERNEL_POOL_IDLE_TIMEOUT:=60000}"

# -- Allowlist (TOML inline array) --
: "${KERNEL_ALLOWLIST_VENDORS:=[\"api.openai.com\",\"api.anthropic.com\"]}"

# -- Logging --
: "${KERNEL_LOG_LEVEL:=info}"
: "${KERNEL_LOG_FORMAT:=json}"

# -- Policy --
: "${KERNEL_REVIEW_DB_PATH:=/data/review_queue.db}"
: "${KERNEL_POLICIES_DIR:=/app/policies/}"
: "${KERNEL_DISTRIBUTION_ADDR:=https://control-plane:50052}"
: "${KERNEL_ORG_ID:=default}"

# -- Template control --
: "${KERNEL_FORCE_TEMPLATE:=false}"

# -- Evidence collector --
: "${KERNEL_EVIDENCE_COLLECTOR_ADDR:=https://evidence-collector:50051}"

# -- mTLS client certificates (for gRPC channels to evidence collector and control plane) --
: "${KERNEL_MTLS_CA_CERT:=/certs/internal-ca.pem}"
: "${KERNEL_MTLS_CLIENT_CERT:=/certs/kernel-client.pem}"
: "${KERNEL_MTLS_CLIENT_KEY:=/certs/kernel-client-key.pem}"

# Generate interdict.toml from template into /tmp (rootfs may be read-only)
CONFIG_PATH="/tmp/interdict.toml"
if [ ! -f "${CONFIG_PATH}" ] || [ "${KERNEL_FORCE_TEMPLATE}" = "true" ]; then
    echo "[entrypoint] Generating interdict.toml from environment variables..."
    envsubst < /app/interdict.toml.template > "${CONFIG_PATH}"
fi

# Auto-generate CA cert/key if not present (pilot convenience)
if [ ! -f "${KERNEL_CA_CERT_PATH}" ]; then
    echo "[entrypoint] Generating self-signed CA certificate..."
    # 1-year validity — rotate before expiry. See docs/operator/guide.md for rotation procedure.
    openssl req -x509 -newkey ed25519 \
        -keyout "${KERNEL_CA_KEY_PATH}" \
        -out "${KERNEL_CA_CERT_PATH}" \
        -days 365 -nodes \
        -subj "/CN=Interdict CA/O=Interdict"
    chmod 600 "${KERNEL_CA_KEY_PATH}"
    echo "[entrypoint] CA certificate generated at ${KERNEL_CA_CERT_PATH}"
fi

echo "[entrypoint] Starting Interdict kernel..."
exec /usr/local/bin/interdict-kernel "${CONFIG_PATH}"
