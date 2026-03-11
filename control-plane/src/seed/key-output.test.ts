import { describe, expect, test } from "bun:test";
import { buildSeedKeyOutput } from "./key-output";

describe("buildSeedKeyOutput", () => {
  const records = [
    {
      email: "admin@interdict.io",
      prefix: "ik_live_abcd1234",
      plaintext: "ik_live_abcd1234_super_secret_material",
    },
  ];

  test("never includes raw api key material", () => {
    const output = buildSeedKeyOutput(records).join("\n");

    expect(output).not.toContain(records[0].plaintext!);
    expect(output).not.toContain("super_secret_material");
  });

  test("legacy showKeys toggle does not change safe output", () => {
    const safeOutput = buildSeedKeyOutput(records).join("\n");
    const legacyToggleOutput = buildSeedKeyOutput(records, { showKeys: true }).join("\n");

    expect(legacyToggleOutput).toBe(safeOutput);
    expect(legacyToggleOutput).not.toContain(records[0].plaintext!);
  });

  test("keeps operator-visible principal metadata", () => {
    const output = buildSeedKeyOutput(records).join("\n");

    expect(output).toContain("admin@interdict.io");
    expect(output).toContain("ik_live_abcd1234");
    expect(output).toContain("GENERATED API KEY METADATA");
  });
});
