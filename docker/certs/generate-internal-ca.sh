#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Internal CA and Service Certificate Generator
# ---------------------------------------------------------------------------
# Generates a self-signed internal CA and per-service certificates for mTLS
# between kernel, control-plane, and evidence-collector gRPC channels.
#
# Output directory: /certs/ (shared Docker volume)
#
# Files generated:
#   /certs/internal-ca.pem            - CA certificate (trust anchor)
#   /certs/internal-ca-key.pem        - CA private key
#   /certs/evidence-collector.pem     - Evidence collector server cert
#   /certs/evidence-collector-key.pem - Evidence collector server key
#   /certs/control-plane.pem          - Control plane server cert
#   /certs/control-plane-key.pem      - Control plane server key
#   /certs/kernel-client.pem          - Kernel client cert
#   /certs/kernel-client-key.pem      - Kernel client key
#
# Idempotent: skips generation if /certs/internal-ca.pem already exists.
# ---------------------------------------------------------------------------

CERT_DIR="${CERT_DIR:-/certs}"

if [ -f "${CERT_DIR}/internal-ca.pem" ]; then
    echo "[cert-init] Certificates already exist at ${CERT_DIR}/internal-ca.pem, skipping generation."
    exit 0
fi

echo "[cert-init] Generating internal CA and service certificates..."

# ---------------------------------------------------------------------------
# 1. Internal CA (1-year validity, ECDSA P-256)
# ---------------------------------------------------------------------------
# 1-year validity — rotate before expiry. See docs/operator/guide.md for rotation procedure.
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "${CERT_DIR}/internal-ca-key.pem" \
    -out "${CERT_DIR}/internal-ca.pem" \
    -days 365 -nodes \
    -subj "/CN=interdict-internal-ca/O=Interdict"

echo "[cert-init] Internal CA generated."

# ---------------------------------------------------------------------------
# Helper: generate a CA-signed service certificate
# Args: $1=name $2=SAN (e.g. "DNS:foo,DNS:localhost")
# ---------------------------------------------------------------------------
generate_service_cert() {
    name="$1"
    san="$2"

    # Write OpenSSL extension config
    cat > "/tmp/${name}-ext.cnf" <<EXTEOF
[v3_ext]
subjectAltName=${san}
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth,clientAuth
EXTEOF

    # Generate private key and CSR
    openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
        -keyout "${CERT_DIR}/${name}-key.pem" \
        -out "/tmp/${name}.csr" \
        -nodes \
        -subj "/CN=${name}/O=Interdict"

    # Sign with internal CA (1-year validity)
    openssl x509 -req \
        -in "/tmp/${name}.csr" \
        -CA "${CERT_DIR}/internal-ca.pem" \
        -CAkey "${CERT_DIR}/internal-ca-key.pem" \
        -CAcreateserial \
        -out "${CERT_DIR}/${name}.pem" \
        -days 365 \
        -extensions v3_ext \
        -extfile "/tmp/${name}-ext.cnf"

    # Clean up temp files
    rm -f "/tmp/${name}.csr" "/tmp/${name}-ext.cnf"

    echo "[cert-init] Certificate generated for ${name}."
}

# ---------------------------------------------------------------------------
# 2. Evidence collector server certificate
# ---------------------------------------------------------------------------
generate_service_cert "evidence-collector" "DNS:evidence-collector,DNS:localhost"

# ---------------------------------------------------------------------------
# 3. Control plane server certificate
# ---------------------------------------------------------------------------
generate_service_cert "control-plane" "DNS:control-plane,DNS:localhost"

# ---------------------------------------------------------------------------
# 4. Kernel client certificate
# ---------------------------------------------------------------------------
generate_service_cert "kernel-client" "DNS:kernel,DNS:localhost"

# ---------------------------------------------------------------------------
# 5. SAML SP self-signed certificate (3-year validity, ECDSA P-256)
# ---------------------------------------------------------------------------
# Used by samlify for SAML assertion signing. Self-signed is fine for SAML SP.
# Only generated if not already present (allows operator to provide their own).
if [ ! -f "${CERT_DIR}/saml-sp.key" ]; then
    echo "[cert-init] Generating SAML SP certificate..."
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
        -days 1095 -nodes \
        -keyout "${CERT_DIR}/saml-sp.key" \
        -out "${CERT_DIR}/saml-sp.crt" \
        -subj "/CN=interdict-saml-sp/O=Interdict"
    echo "[cert-init] SAML SP certificate generated."
else
    echo "[cert-init] SAML SP certificate already exists, skipping."
fi

# ---------------------------------------------------------------------------
# 6. Set permissions
# ---------------------------------------------------------------------------
# Certificates are world-readable; private keys are owner-only
chmod 644 "${CERT_DIR}"/*.pem
chmod 640 "${CERT_DIR}"/*-key.pem
# Ensure UID 1000 (service user) can read private keys
chown -R 0:1000 "${CERT_DIR}" 2>/dev/null || true

echo "[cert-init] All certificates generated successfully."

# ---------------------------------------------------------------------------
# 7. Certificate expiry monitoring
# ---------------------------------------------------------------------------
# Check all certificates and warn if any expire within 30 days.
# Operators can grep container logs for "[certs] WARNING" to detect
# impending expiry. See docs/operator/guide.md for rotation procedure.
# ---------------------------------------------------------------------------
WARN_DAYS=30
WARN_SECS=$((WARN_DAYS * 86400))
NOW_EPOCH=$(date +%s)

for cert_file in "${CERT_DIR}"/*.pem; do
    # Skip private key files
    case "${cert_file}" in *-key.pem) continue ;; esac

    if [ ! -f "${cert_file}" ]; then
        continue
    fi

    # Extract expiry date from certificate
    END_DATE=$(openssl x509 -enddate -noout -in "${cert_file}" 2>/dev/null | sed 's/notAfter=//')
    if [ -z "${END_DATE}" ]; then
        continue
    fi

    # Convert expiry to epoch (portable: works with GNU and BusyBox date)
    END_EPOCH=$(date -d "${END_DATE}" +%s 2>/dev/null || date -D "%b %d %T %Y %Z" -d "${END_DATE}" +%s 2>/dev/null || echo "")
    if [ -z "${END_EPOCH}" ]; then
        continue
    fi

    REMAINING_SECS=$((END_EPOCH - NOW_EPOCH))
    REMAINING_DAYS=$((REMAINING_SECS / 86400))

    if [ "${REMAINING_SECS}" -le 0 ]; then
        echo "[certs] WARNING: Certificate ${cert_file} has EXPIRED. See docs/operator/guide.md for rotation." >&2
    elif [ "${REMAINING_SECS}" -le "${WARN_SECS}" ]; then
        echo "[certs] WARNING: Certificate expires in ${REMAINING_DAYS} days (${cert_file}). See docs/operator/guide.md for rotation." >&2
    fi
done

ls -la "${CERT_DIR}/"
