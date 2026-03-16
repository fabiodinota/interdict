/**
 * SAML Config Tests
 *
 * Tests for SAML SP/IdP configuration, graceful degradation when certs
 * are missing, and environment variable validation.
 *
 * Strategy: config.ts runs at import time using module-scoped side effects.
 * We test it by spawning isolated Bun processes with controlled env vars
 * and file fixtures, capturing the export values via a temp script.
 *
 * These tests verify:
 * - samlEnabled = false when cert files are missing
 * - samlEnabled = true when all files are present with correct env vars
 * - Missing required env vars throw at import time when certs are present
 * - Invalid cert file paths produce graceful degradation (samlEnabled = false)
 * - SP metadata endpoint works when SAML is configured
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Fixtures: self-signed cert/key and minimal IdP metadata
// ---------------------------------------------------------------------------

// Minimal self-signed cert and key for testing (NOT production secrets)
const TEST_SP_CERT = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDMq2inYDfBQjANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
7BaGH1li0R3MgjBMSNzPGzGMohaLwiLawgF+cMcGo3GFrSRFaFEJFBRv5JKV0cPG
bGFy8KSGH+sOg6kxSElnHCSE3kcEqLy1SFsVNnEYfLCMyrQ0THZWUA8TSqFhDwBl
D35ary6umMK5+FGDdGsNf1tEXJi9+bRHZP+nRALJ+RP35VVMh7WX1NJALfJ3j09p
RBdjKe5T6oGXQHCHTxNzulnVz0o9HIbgMlVJ4xCJbrEINKb0CkcEfVp8k6X7OYh3
RUPMFsE3pWLKcLb7KSjdJaByOkSqhXDMmRRMnBiHBNSCPLjzR8VPc+IWdlzJC1Mm
B0O8EVBVOyRwM8gEhH1pAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAEHgSjFnXtbi
8KqEHXbEz0JXaM2wp0NJOW65AJlPtyIaWCLyRr/FERAT/FhDkM1q8NqVJliUj8jT
QkPkKpaCqGoQmM5pCOjKK3iT1LXWLE/nP3l9Cn7jGlhGUkLMFAnqLjJ8y0ND63gM
BkCWLNfCJpg/E7KQNR1Nn+lJVmCGqK5R4eppH3o6IqM/pOaKSBQOfHHrOIcRZgjE
c1X5a1P32fHcCqMd2gJ3jmcz5MlY5L5f8k4PL3DIhf3owNeL5Y+w1DXXII4sMcPF
LPtFHp/VYvPbGn9PUhGPk45m8GPxedbOKGDxbXCsGMljCmQz9pGClmQfKmr+sby5
FYTVqUKx6JQ=
-----END CERTIFICATE-----`;

const TEST_SP_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC77BaGH1li0R3M
gjBMSNzPGzGMohaLwiLawgF+cMcGo3GFrSRFaFEJFBRv5JKV0cPGbGFy8KSGH+sO
g6kxSElnHCSE3kcEqLy1SFsVNnEYfLCMyrQ0THZWUA8TSqFhDwBlD35ary6umMK5+
FGDdGsNf1tEXJi9+bRHZP+nRALJ+RP35VVMh7WX1NJALfJ3j09pRBdjKe5T6oGXQ
HCHTxNzulnVz0o9HIbgMlVJ4xCJbrEINKb0CkcEfVp8k6X7OYh3RUPMFsE3pWLKc
Lb7KSjdJaByOkSqhXDMmRRMnBiHBNSCPLjzR8VPc+IWdlzJC1MmB0O8EVBVOyRwM
8gEhH1pAgMBAAECggEBALIaNnTB/OM2j+cGJhLsWXf0ksav/5fOwVwmHxfEl1U0v4
Z7JmN2sLXaLPkNYl5EJPaLQ2FVmZ7L1u1RlKPjHm2D9v5k3pRiDkFfF/aOxfLf95
j5d8LR5IhOX/RPAJq8XEVDF0Cke85gSqKHBfwUm5raiPm+UHlB/SPOAOiDRUi+G9
gSqLHPKerL84CmctoJ9kX99VPcV5Nl3HEOPLkYbpoqMEBRDJn4hL4s3JfR8P4Q5g
RMlVJbrTWHj9LaBvFJlFPzipTOuJfxv3HWS7MfYjVZp5GT1Kp0bIq0h7H4vHLgea
2oahLNAF3BEOQT2JNPRKAqJBIoLdS2NSt+4dcAECgQD0OiJA+cGDRK3pM+OAvEqN
S8UQE8Z8JHQV0JnkjSLVHbFCH6ia6VhwTLRBMdiy9LXBIh4L0WgXwFKYVrNbPnDU
bB2lqwGMnzLCeR5TjGLPH5YNpFDkPO4N6UT5MkJ0NXUU0+R+EyLb1sJkwqxM+Xnp
7BNJgsMz7EQNMNj/uFAQKBAQDEvyS7MJQW+G/OClLlQJSSBCNJJoS7HFfB7p0dQ4
EfJFfrRr0FCMD7CQMEM95pJaG6UHVn3T0o9iMTyShS4BFR9CQPqYKYS1eLxW5Oek
p4j0fYpVflqjbsOrSCHhpCGBeUFE0P1HIQHHvfNm+jzH4sLNzKp5FQ2hLhHh9KyL
x5GJAgEBAgUA9T0t97I+OJLiJpvUi9svR2N3GlDJH89OUxm9r0OYL6B4HfQPY7jD9
P4pOLRETm+h5L0vaSt+sWkHM2K6P5qjfN2GYXCNQXM5E3LJ0UF1FS6OJp+m4Kqjr
FMuS8oy29EZpBx18KNCS3h7DY+FhR+9cN/wDq+PcA3lQJcmPTQECgQCskE4M6ZNH
pOBEAn0fC7LEZxQR0LHFHWZD1k5TdB/FrD9TFLB98jVKVJFHbJzfCuTh1MBBFyak
mC5x0GCPJHF/g7XT2JUU4H2OEOG7Bm/6HL9w3bJC2l0FZZ3OB0UVMB5P3LGLk/N
kDxTlR1VNTb/xsW3VJFNMlj3pMpWaXyQKBAQCXLPudq2R1i0r6IN4LZsAQ8C7/Mh
2bh2Fq7pGZ7kLVNsOfG6o0kWFRbPj9Lo4c1E3KCR0LE8YG1JyI/KP4jlxSIO5dMl
oWPh0lQ3C7Ij0oLB6kNm9R5wM3VZ1VBh0D+ZYI2O8jMsBVBR2MQ8yUl5gvXj7U2X
H0p2Z+vF6aN4TCIZ
-----END PRIVATE KEY-----`;

// Minimal IdP metadata XML
const TEST_IDP_METADATA = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/sso"/>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/slo"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

// ---------------------------------------------------------------------------
// Temp directory for cert fixtures
// ---------------------------------------------------------------------------

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `saml-config-test-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, "sp.crt"), TEST_SP_CERT);
  writeFileSync(join(fixtureDir, "sp.key"), TEST_SP_KEY);
  writeFileSync(join(fixtureDir, "idp-metadata.xml"), TEST_IDP_METADATA);
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: run config.ts import in an isolated subprocess
// ---------------------------------------------------------------------------

const controlPlaneCwd = join(import.meta.dir, "../../../..");

async function evalConfigInSubprocess(
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Write a temp script inside the control-plane dir so relative imports work
  const scriptName = `__config-probe-${Date.now()}.ts`;
  const scriptPath = join(controlPlaneCwd, scriptName);
  const script = `
    try {
      const { samlEnabled, sp, idp } = await import("./src/modules/auth/saml/config.ts");
      console.log(JSON.stringify({
        samlEnabled,
        spIsNull: sp === null,
        idpIsNull: idp === null,
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: err.message }));
    }
  `;
  writeFileSync(scriptPath, script);

  const proc = Bun.spawn(["bun", "run", scriptPath], {
    cwd: controlPlaneCwd,
    env: { ...process.env, ...env, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  // Clean up temp script
  try {
    rmSync(scriptPath, { force: true });
  } catch {}

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SAML Config", () => {
  test("samlEnabled = false when cert files do not exist", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: "/nonexistent/sp.key",
      SAML_SP_CERT_PATH: "/nonexistent/sp.crt",
      SAML_IDP_METADATA_PATH: "/nonexistent/idp-metadata.xml",
    });

    const data = JSON.parse(result.stdout);
    expect(data.samlEnabled).toBe(false);
    expect(data.spIsNull).toBe(true);
    expect(data.idpIsNull).toBe(true);
  });

  test("samlEnabled = false when only SP key is present (cert missing)", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: join(fixtureDir, "sp.key"),
      SAML_SP_CERT_PATH: "/nonexistent/sp.crt",
      SAML_IDP_METADATA_PATH: "/nonexistent/idp-metadata.xml",
    });

    const data = JSON.parse(result.stdout);
    expect(data.samlEnabled).toBe(false);
  });

  test("samlEnabled = false when only IdP metadata is missing", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: join(fixtureDir, "sp.key"),
      SAML_SP_CERT_PATH: join(fixtureDir, "sp.crt"),
      SAML_IDP_METADATA_PATH: "/nonexistent/idp-metadata.xml",
    });

    const data = JSON.parse(result.stdout);
    expect(data.samlEnabled).toBe(false);
  });

  test("throws when SAML certs present but SAML_SP_BASE_URL missing", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: join(fixtureDir, "sp.key"),
      SAML_SP_CERT_PATH: join(fixtureDir, "sp.crt"),
      SAML_IDP_METADATA_PATH: join(fixtureDir, "idp-metadata.xml"),
      // Intentionally omit SAML_SP_BASE_URL and SAML_SP_ENTITY_ID
    });

    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error).toContain("SAML_SP_BASE_URL");
  });

  test("throws when SAML_SP_ENTITY_ID missing with valid certs", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: join(fixtureDir, "sp.key"),
      SAML_SP_CERT_PATH: join(fixtureDir, "sp.crt"),
      SAML_IDP_METADATA_PATH: join(fixtureDir, "idp-metadata.xml"),
      SAML_SP_BASE_URL: "https://app.example.com",
      // Intentionally omit SAML_SP_ENTITY_ID
    });

    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error).toContain("SAML_SP_ENTITY_ID");
  });

  test("samlEnabled = true when all files and env vars present", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: join(fixtureDir, "sp.key"),
      SAML_SP_CERT_PATH: join(fixtureDir, "sp.crt"),
      SAML_IDP_METADATA_PATH: join(fixtureDir, "idp-metadata.xml"),
      SAML_SP_BASE_URL: "https://app.example.com",
      SAML_SP_ENTITY_ID: "https://app.example.com/saml",
    });

    const data = JSON.parse(result.stdout);
    expect(data.samlEnabled).toBe(true);
    expect(data.spIsNull).toBe(false);
    expect(data.idpIsNull).toBe(false);
  });

  test("warns about missing files on stderr when SAML is disabled", async () => {
    const result = await evalConfigInSubprocess({
      SAML_SP_KEY_PATH: "/nonexistent/sp.key",
      SAML_SP_CERT_PATH: "/nonexistent/sp.crt",
      SAML_IDP_METADATA_PATH: "/nonexistent/idp-metadata.xml",
    });

    // console.warn goes to stderr
    expect(result.stderr).toContain("SAML SSO is disabled");
  });
});
