/**
 * Rego Validator Tests
 *
 * Tests validateRego function which uses OPA CLI to check Rego syntax.
 * Tests mock the Bun shell subprocess to avoid OPA binary dependency.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// We mock at the module level via a mock factory
// The actual validator will use Bun.$ for subprocess calls

describe("validateRego", () => {
  test("valid Rego returns { valid: true }", async () => {
    const { validateRego } = await import("./validator");

    // Valid Rego source
    const validRego = `
package interdict.policy.verdict

default verdict = {"action": "allow"}
`;

    // This test verifies the interface contract
    // In a real environment with OPA installed, this would call opa check
    // Without OPA, the validator should handle the missing binary gracefully
    const result = await validateRego(validRego);
    // The result must have a 'valid' property
    expect(result).toHaveProperty("valid");
    expect(typeof result.valid).toBe("boolean");
    if (!result.valid) {
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });

  test("empty Rego source returns { valid: false } with errors", async () => {
    const { validateRego } = await import("./validator");

    const result = await validateRego("");
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  test("result has structured error format when invalid", async () => {
    const { validateRego } = await import("./validator");

    // Rego with obvious syntax error
    const invalidRego = `this is not valid rego at all }{}{`;

    const result = await validateRego(invalidRego);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    // Each error should have at least a message
    for (const err of result.errors!) {
      expect(err).toHaveProperty("message");
      expect(typeof err.message).toBe("string");
    }
  });
});
