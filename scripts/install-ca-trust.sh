#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# install-ca-trust.sh -- Install/Remove Interdict CA Certificate
# ---------------------------------------------------------------------------
#
# Installs the Interdict MITM proxy CA certificate into the system trust
# store on macOS and Linux. This is the PROXY CA that browsers and CLI tools
# need to trust for AI traffic inspection -- NOT the internal mTLS CA used
# between Interdict services (those certs are managed by cert-init).
#
# Supported platforms:
#   - macOS (Darwin) via security(1)
#   - Debian / Ubuntu via update-ca-certificates
#   - RHEL / CentOS / Fedora via update-ca-trust
#
# Usage:
#   sudo ./install-ca-trust.sh /path/to/interdict-ca.pem
#   sudo ./install-ca-trust.sh --remove /path/to/interdict-ca.pem
#
# Examples:
#   # Install the CA cert on macOS
#   sudo ./install-ca-trust.sh ./interdict-ca.pem
#
#   # Install the CA cert on Ubuntu
#   sudo ./install-ca-trust.sh /tmp/interdict-ca.pem
#
#   # Remove the CA cert
#   sudo ./install-ca-trust.sh --remove /tmp/interdict-ca.pem
#
# Requirements:
#   - Must run as root (sudo)
#   - openssl must be available for PEM validation
#   - Certificate must be valid PEM format
# ---------------------------------------------------------------------------

# -- Color output helpers ---------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

print_error() {
    echo -e "${RED}ERROR:${NC} $1" >&2
}

print_info() {
    echo -e "${YELLOW}INFO:${NC} $1"
}

# -- Argument parsing -------------------------------------------------------

REMOVE_MODE=false
CERT_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --remove)
            REMOVE_MODE=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            echo "Usage: $0 [--remove] <path-to-ca-cert.pem>"
            exit 1
            ;;
        *)
            CERT_PATH="$1"
            shift
            ;;
    esac
done

# -- Validation checks ------------------------------------------------------

if [ -z "$CERT_PATH" ]; then
    print_error "Certificate path is required."
    echo "Usage: $0 [--remove] <path-to-ca-cert.pem>"
    exit 1
fi

if [ ! -f "$CERT_PATH" ]; then
    print_error "Certificate file not found: $CERT_PATH"
    exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
    print_error "This script requires root privileges. Run with sudo."
    exit 1
fi

# Validate the certificate is valid PEM
if ! openssl x509 -in "$CERT_PATH" -noout 2>/dev/null; then
    print_error "File is not a valid PEM certificate: $CERT_PATH"
    exit 1
fi

# -- Display certificate info -----------------------------------------------

CERT_SUBJECT=$(openssl x509 -in "$CERT_PATH" -noout -subject 2>/dev/null || echo "unknown")
CERT_ISSUER=$(openssl x509 -in "$CERT_PATH" -noout -issuer 2>/dev/null || echo "unknown")
CERT_FINGERPRINT=$(openssl x509 -in "$CERT_PATH" -noout -fingerprint -sha256 2>/dev/null || echo "unknown")

print_info "Certificate details:"
echo "  Subject:     $CERT_SUBJECT"
echo "  Issuer:      $CERT_ISSUER"
echo "  Fingerprint: $CERT_FINGERPRINT"
echo ""

# -- Platform-specific installation/removal ---------------------------------

OS="$(uname -s)"

case "$OS" in
    Darwin)
        if [ "$REMOVE_MODE" = true ]; then
            print_info "Removing CA certificate from macOS System Keychain..."
            if security remove-trusted-cert -d "$CERT_PATH"; then
                print_success "CA certificate removed from macOS System Keychain."
            else
                print_error "Failed to remove CA certificate from macOS System Keychain."
                exit 1
            fi
        else
            print_info "Installing CA certificate into macOS System Keychain..."
            if security add-trusted-cert -d -r trustRoot \
                -k "/Library/Keychains/System.keychain" "$CERT_PATH"; then
                print_success "CA certificate installed in macOS System Keychain."
                # Verify installation
                if security find-certificate -c "interdict" "/Library/Keychains/System.keychain" >/dev/null 2>&1; then
                    print_success "Verification passed: certificate found in System Keychain."
                else
                    print_info "Note: Could not verify by name 'interdict'. Check manually if CN differs."
                fi
            else
                print_error "Failed to install CA certificate. Check that the file is a valid CA cert."
                exit 1
            fi
        fi
        ;;

    Linux)
        # Detect the distro family by available tools
        if command -v update-ca-certificates >/dev/null 2>&1; then
            # -- Debian / Ubuntu / derivatives --
            DEST="/usr/local/share/ca-certificates/interdict-ca.crt"

            if [ "$REMOVE_MODE" = true ]; then
                print_info "Removing CA certificate from Debian/Ubuntu trust store..."
                if [ -f "$DEST" ]; then
                    rm -f "$DEST"
                    update-ca-certificates --fresh
                    print_success "CA certificate removed. Trust store refreshed."
                else
                    print_info "Certificate not found at $DEST. Nothing to remove."
                fi
            else
                print_info "Installing CA certificate into Debian/Ubuntu trust store..."
                cp "$CERT_PATH" "$DEST"
                update-ca-certificates
                print_success "CA certificate installed at $DEST."
                # Verify
                if openssl verify -CApath /etc/ssl/certs/ "$DEST" >/dev/null 2>&1; then
                    print_success "Verification passed: certificate is trusted."
                else
                    print_info "Note: openssl verify did not confirm trust. This may be normal for self-signed CA certs."
                fi
            fi

        elif command -v update-ca-trust >/dev/null 2>&1; then
            # -- RHEL / CentOS / Fedora / derivatives --
            DEST="/etc/pki/ca-trust/source/anchors/interdict-ca.pem"

            if [ "$REMOVE_MODE" = true ]; then
                print_info "Removing CA certificate from RHEL/CentOS trust store..."
                if [ -f "$DEST" ]; then
                    rm -f "$DEST"
                    update-ca-trust extract
                    print_success "CA certificate removed. Trust store refreshed."
                else
                    print_info "Certificate not found at $DEST. Nothing to remove."
                fi
            else
                print_info "Installing CA certificate into RHEL/CentOS trust store..."
                cp "$CERT_PATH" "$DEST"
                update-ca-trust extract
                print_success "CA certificate installed at $DEST."
                # Verify
                if trust list 2>/dev/null | grep -qi "interdict"; then
                    print_success "Verification passed: certificate found in trust list."
                else
                    print_info "Note: Could not verify via 'trust list'. Check manually if CN differs."
                fi
            fi

        else
            print_error "No supported certificate management tool found."
            print_error "Expected one of: update-ca-certificates (Debian/Ubuntu) or update-ca-trust (RHEL/CentOS/Fedora)."
            exit 1
        fi
        ;;

    *)
        print_error "Unsupported operating system: $OS"
        print_error "For Windows, use install-ca-trust.ps1 (PowerShell)."
        exit 1
        ;;
esac

echo ""
if [ "$REMOVE_MODE" = true ]; then
    print_success "Interdict CA certificate removal complete."
else
    print_success "Interdict CA certificate installation complete."
    print_info "Browsers and CLI tools should now trust the Interdict proxy."
fi
