/**
 * TypeBox Schema Validation Tests
 *
 * Verifies that maxLength constraints on model schemas reject oversized strings
 * and accept strings within bounds. Uses TypeBox Value.Check directly — no
 * server needed.
 */

import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { CreatePolicyBody, UpdatePolicyBody } from "./policies/model";
import { CreateVendorBody, UpdateVendorBody } from "./vendors/model";
import { ActivateFrameworkBody } from "./regulatory/model";
import { ResolveReviewBody } from "./reviews/model";
import { CreateApiKeyBody, ExchangeApiKeyBody } from "./auth/model";

// ---------------------------------------------------------------------------
// Helper: build a string of N characters
// ---------------------------------------------------------------------------
function strOfLen(n: number): string {
  return "x".repeat(n);
}

// ---------------------------------------------------------------------------
// Policy schemas
// ---------------------------------------------------------------------------
describe("CreatePolicyBody maxLength", () => {
  test("accepts name at 255 chars", () => {
    const valid = {
      name: strOfLen(255),
      rego_source: "package interdict",
    };
    expect(Value.Check(CreatePolicyBody, valid)).toBe(true);
  });

  test("rejects name exceeding 255 chars", () => {
    const invalid = {
      name: strOfLen(256),
      rego_source: "package interdict",
    };
    expect(Value.Check(CreatePolicyBody, invalid)).toBe(false);
  });

  test("rejects description exceeding 10,000 chars", () => {
    const invalid = {
      name: "test",
      description: strOfLen(10_001),
      rego_source: "package interdict",
    };
    expect(Value.Check(CreatePolicyBody, invalid)).toBe(false);
  });

  test("accepts description at 10,000 chars", () => {
    const valid = {
      name: "test",
      description: strOfLen(10_000),
      rego_source: "package interdict",
    };
    expect(Value.Check(CreatePolicyBody, valid)).toBe(true);
  });

  test("rejects rego_source exceeding 500,000 chars", () => {
    const invalid = {
      name: "test",
      rego_source: strOfLen(500_001),
    };
    expect(Value.Check(CreatePolicyBody, invalid)).toBe(false);
  });

  test("accepts rego_source at 500,000 chars", () => {
    const valid = {
      name: "test",
      rego_source: strOfLen(500_000),
    };
    expect(Value.Check(CreatePolicyBody, valid)).toBe(true);
  });
});

describe("UpdatePolicyBody maxLength", () => {
  test("rejects rego_source exceeding 500,000 chars", () => {
    const invalid = { rego_source: strOfLen(500_001) };
    expect(Value.Check(UpdatePolicyBody, invalid)).toBe(false);
  });

  test("rejects change_description exceeding 5,000 chars", () => {
    const invalid = {
      rego_source: "package interdict",
      change_description: strOfLen(5_001),
    };
    expect(Value.Check(UpdatePolicyBody, invalid)).toBe(false);
  });

  test("accepts change_description at 5,000 chars", () => {
    const valid = {
      rego_source: "package interdict",
      change_description: strOfLen(5_000),
    };
    expect(Value.Check(UpdatePolicyBody, valid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vendor schemas
// ---------------------------------------------------------------------------
describe("CreateVendorBody maxLength", () => {
  test("rejects base_url exceeding 2,000 chars", () => {
    const invalid = {
      name: "openai",
      display_name: "OpenAI",
      base_url: strOfLen(2_001),
    };
    expect(Value.Check(CreateVendorBody, invalid)).toBe(false);
  });

  test("accepts base_url at 2,000 chars", () => {
    const valid = {
      name: "openai",
      display_name: "OpenAI",
      base_url: strOfLen(2_000),
    };
    expect(Value.Check(CreateVendorBody, valid)).toBe(true);
  });

  test("rejects description exceeding 10,000 chars", () => {
    const invalid = {
      name: "openai",
      display_name: "OpenAI",
      description: strOfLen(10_001),
    };
    expect(Value.Check(CreateVendorBody, invalid)).toBe(false);
  });
});

describe("UpdateVendorBody maxLength", () => {
  test("rejects base_url exceeding 2,000 chars", () => {
    const invalid = { base_url: strOfLen(2_001) };
    expect(Value.Check(UpdateVendorBody, invalid)).toBe(false);
  });

  test("rejects description exceeding 10,000 chars", () => {
    const invalid = { description: strOfLen(10_001) };
    expect(Value.Check(UpdateVendorBody, invalid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regulatory schemas
// ---------------------------------------------------------------------------
describe("ActivateFrameworkBody maxLength", () => {
  test("rejects notes exceeding 5,000 chars", () => {
    const invalid = { notes: strOfLen(5_001) };
    expect(Value.Check(ActivateFrameworkBody, invalid)).toBe(false);
  });

  test("accepts notes at 5,000 chars", () => {
    const valid = { notes: strOfLen(5_000) };
    expect(Value.Check(ActivateFrameworkBody, valid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reviews schemas
// ---------------------------------------------------------------------------
describe("ResolveReviewBody maxLength", () => {
  test("rejects resolution_notes exceeding 5,000 chars", () => {
    const invalid = {
      resolution: "false_positive" as const,
      resolution_notes: strOfLen(5_001),
    };
    expect(Value.Check(ResolveReviewBody, invalid)).toBe(false);
  });

  test("accepts resolution_notes at 5,000 chars", () => {
    const valid = {
      resolution: "false_positive" as const,
      resolution_notes: strOfLen(5_000),
    };
    expect(Value.Check(ResolveReviewBody, valid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------
describe("Auth schema maxLength", () => {
  test("rejects apiKey exceeding 255 chars", () => {
    const invalid = { apiKey: strOfLen(256) };
    expect(Value.Check(ExchangeApiKeyBody, invalid)).toBe(false);
  });

  test("accepts apiKey at 255 chars", () => {
    const valid = { apiKey: strOfLen(255) };
    expect(Value.Check(ExchangeApiKeyBody, valid)).toBe(true);
  });

  test("rejects label exceeding 255 chars", () => {
    const invalid = { label: strOfLen(256) };
    expect(Value.Check(CreateApiKeyBody, invalid)).toBe(false);
  });
});
