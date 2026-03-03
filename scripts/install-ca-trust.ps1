<#
.SYNOPSIS
    Install or remove the Interdict proxy CA certificate from Windows trust store.
.DESCRIPTION
    This script installs the Interdict MITM proxy CA certificate into the
    Windows Trusted Root Certification Authorities store. This allows browsers
    and applications to trust the Interdict proxy for AI traffic inspection.

    This is the PROXY CA that browsers and CLI tools need to trust -- NOT the
    internal mTLS CA used between Interdict services (those certs are managed
    by the cert-init container).
.PARAMETER CertPath
    Path to the Interdict CA certificate file (PEM or CER format).
.PARAMETER Remove
    Remove the Interdict CA certificate instead of installing it.
.EXAMPLE
    .\install-ca-trust.ps1 -CertPath .\interdict-ca.pem
.EXAMPLE
    .\install-ca-trust.ps1 -CertPath .\interdict-ca.pem -Remove
.NOTES
    Must be run as Administrator. The #Requires directive enforces this.
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, HelpMessage = "Path to the Interdict CA certificate file")]
    [string]$CertPath,

    [Parameter(Mandatory = $false, HelpMessage = "Remove the certificate instead of installing")]
    [switch]$Remove
)

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

if (-not (Test-Path $CertPath)) {
    Write-Error "Certificate file not found: $CertPath"
    exit 1
}

$resolvedPath = Resolve-Path $CertPath

# ---------------------------------------------------------------------------
# Remove mode
# ---------------------------------------------------------------------------

if ($Remove) {
    Write-Host "INFO: Searching for Interdict CA certificate in Trusted Root store..." -ForegroundColor Yellow

    $certs = Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object {
        $_.Subject -match "interdict" -or $_.Issuer -match "interdict"
    }

    if ($certs.Count -eq 0) {
        Write-Host "INFO: No Interdict CA certificate found in Trusted Root store. Nothing to remove." -ForegroundColor Yellow
        exit 0
    }

    foreach ($cert in $certs) {
        try {
            $thumbprint = $cert.Thumbprint
            $subject = $cert.Subject
            Remove-Item -Path "Cert:\LocalMachine\Root\$thumbprint" -Force
            Write-Host "SUCCESS: Removed certificate:" -ForegroundColor Green
            Write-Host "  Subject:     $subject"
            Write-Host "  Thumbprint:  $thumbprint"
        }
        catch {
            Write-Error "Failed to remove certificate ($($cert.Thumbprint)): $_"
            exit 1
        }
    }

    Write-Host ""
    Write-Host "SUCCESS: Interdict CA certificate removal complete." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# Install mode (default)
# ---------------------------------------------------------------------------

Write-Host "INFO: Installing Interdict CA certificate into Windows Trusted Root store..." -ForegroundColor Yellow
Write-Host "  File: $resolvedPath"
Write-Host ""

try {
    $importedCert = Import-Certificate -FilePath $resolvedPath -CertStoreLocation Cert:\LocalMachine\Root

    Write-Host "SUCCESS: CA certificate installed in Windows Trusted Root store." -ForegroundColor Green
    Write-Host "  Subject:     $($importedCert.Subject)"
    Write-Host "  Issuer:      $($importedCert.Issuer)"
    Write-Host "  Thumbprint:  $($importedCert.Thumbprint)"
    Write-Host "  Not Before:  $($importedCert.NotBefore)"
    Write-Host "  Not After:   $($importedCert.NotAfter)"
    Write-Host ""
    Write-Host "SUCCESS: Interdict CA certificate installation complete." -ForegroundColor Green
    Write-Host "INFO: Browsers and applications should now trust the Interdict proxy." -ForegroundColor Yellow
}
catch {
    Write-Error "Failed to install certificate: $_"
    Write-Host "HINT: Ensure the file is a valid certificate in PEM or CER format." -ForegroundColor Yellow
    exit 1
}
