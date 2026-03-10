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
# 1. Internal CA (10-year validity, ECDSA P-256)
# ---------------------------------------------------------------------------
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "${CERT_DIR}/internal-ca-key.pem" \
    -out "${CERT_DIR}/internal-ca.pem" \
    -days 3650 -nodes \
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
chmod 600 "${CERT_DIR}"/*-key.pem

echo "[cert-init] All certificates generated successfully."
ls -la "${CERT_DIR}/"
