/**
 * SAML SP Configuration
 *
 * Configures samlify ServiceProvider and IdentityProvider using file-based
 * certificates and metadata. Private keys are NEVER stored in environment
 * variables (CLAUDE.md Invariant #6).
 *
 * Graceful degradation: if cert files are missing, SAML is disabled and
 * API key auth continues to work normally.
 */

import * as samlify from "samlify";
// @ts-ignore -- no type declarations for this package
import * as validator from "@authenio/samlify-xsd-schema-validator";
import { readFileSync, existsSync } from "node:fs";

// Set the XSD schema validator for XML signature verification
samlify.setSchemaValidator(validator);

// ---------------------------------------------------------------------------
// Environment Configuration
// ---------------------------------------------------------------------------

const SP_ENTITY_ID =
  process.env.SAML_SP_ENTITY_ID ||
  "https://interdict.example.com/saml/metadata";

const SP_KEY_PATH = process.env.SAML_SP_KEY_PATH || "/certs/saml-sp.key";
const SP_CERT_PATH = process.env.SAML_SP_CERT_PATH || "/certs/saml-sp.crt";
const IDP_METADATA_PATH =
  process.env.SAML_IDP_METADATA_PATH || "/config/idp-metadata.xml";

const BASE_URL =
  process.env.SAML_SP_BASE_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// File Loading (graceful degradation)
// ---------------------------------------------------------------------------

function loadFileOrNull(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

const spKey = loadFileOrNull(SP_KEY_PATH);
const spCert = loadFileOrNull(SP_CERT_PATH);
const idpMetadata = loadFileOrNull(IDP_METADATA_PATH);

// ---------------------------------------------------------------------------
// SAML Enabled Flag
// ---------------------------------------------------------------------------

/** SAML is enabled only when SP cert, key, and IdP metadata are all present */
export const samlEnabled = !!(spKey && spCert && idpMetadata);

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
      signingCert: spCert!,
      privateKey: spKey!,
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
      metadata: idpMetadata!,
    })
  : null;
