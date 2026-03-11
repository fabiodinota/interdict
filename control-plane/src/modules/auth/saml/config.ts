/**
 * SAML SP Configuration
 *
 * Configures samlify ServiceProvider and IdentityProvider using file-based
 * certificates and metadata. Private keys are NEVER stored in environment
 * variables (CLAUDE.md Invariant #6).
 *
 * Graceful degradation: if cert files are missing, SAML is disabled and
 * API key auth continues to work normally. When certs/metadata are present,
 * required URLs must be configured explicitly; there are no localhost or
 * example-domain fallbacks.
 */

import * as samlify from "samlify";
import * as validator from "@authenio/samlify-xsd-schema-validator";
import { readFileSync, existsSync } from "node:fs";

// Set the XSD schema validator for XML signature verification
samlify.setSchemaValidator(
  validator as unknown as Parameters<typeof samlify.setSchemaValidator>[0]
);

// ---------------------------------------------------------------------------
// Environment Configuration
// ---------------------------------------------------------------------------

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when SAML is enabled`);
  }
  return value;
}

const SP_KEY_PATH = process.env.SAML_SP_KEY_PATH || "/certs/saml-sp.key";
const SP_CERT_PATH = process.env.SAML_SP_CERT_PATH || "/certs/saml-sp.crt";
const IDP_METADATA_PATH =
  process.env.SAML_IDP_METADATA_PATH || "/config/idp-metadata.xml";

// ---------------------------------------------------------------------------
// File Loading (graceful degradation)
// ---------------------------------------------------------------------------

function loadFileOrNull(path: string, label: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch (error: unknown) {
    console.warn(`[SAML] Failed to read ${label}`, {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const spKey = loadFileOrNull(SP_KEY_PATH, "SP private key");
const spCert = loadFileOrNull(SP_CERT_PATH, "SP certificate");
const idpMetadata = loadFileOrNull(IDP_METADATA_PATH, "IdP metadata");

// ---------------------------------------------------------------------------
// SAML Enabled Flag
// ---------------------------------------------------------------------------

/** SAML is enabled only when SP cert, key, and IdP metadata are all present */
export const samlEnabled = !!(spKey && spCert && idpMetadata);

const BASE_URL = samlEnabled ? getRequiredEnv("SAML_SP_BASE_URL") : "";
const SP_ENTITY_ID = samlEnabled ? getRequiredEnv("SAML_SP_ENTITY_ID") : "";
const spKeyValue = spKey ?? undefined;
const spCertValue = spCert ?? undefined;
const idpMetadataValue = idpMetadata ?? undefined;

if (!samlEnabled) {
  console.warn(
    "[SAML] SAML SSO is disabled. Missing cert/key/metadata files. " +
    `Checked: SP_KEY=${SP_KEY_PATH}, SP_CERT=${SP_CERT_PATH}, IDP_META=${IDP_METADATA_PATH}`
  );
}

// ---------------------------------------------------------------------------
// Service Provider
// ---------------------------------------------------------------------------

export const sp = samlEnabled
  ? samlify.ServiceProvider({
      entityID: SP_ENTITY_ID,
      authnRequestsSigned: true,
      wantAssertionsSigned: true,
      wantMessageSigned: false,
      signingCert: spCertValue,
      privateKey: spKeyValue,
      nameIDFormat: ["urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
      assertionConsumerService: [
        {
          Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
          Location: `${BASE_URL}/api/v1/auth/saml/acs`,
        },
      ],
      singleLogoutService: [
        {
          Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
          Location: `${BASE_URL}/api/v1/auth/saml/slo`,
        },
      ],
      clockDrifts: [-300, 300],
    })
  : null;

// ---------------------------------------------------------------------------
// Identity Provider
// ---------------------------------------------------------------------------

export const idp = samlEnabled
  ? samlify.IdentityProvider({
      metadata: idpMetadataValue,
    })
  : null;
