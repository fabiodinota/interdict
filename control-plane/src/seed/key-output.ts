export interface SeedKeyOutputRecord {
  email: string;
  prefix: string;
  plaintext?: string;
}

export interface SeedKeyOutputOptions {
  showKeys?: boolean;
}

export function buildSeedKeyOutput(
  records: SeedKeyOutputRecord[],
  _options: SeedKeyOutputOptions = {},
): string[] {
  if (records.length === 0) {
    return [];
  }

  const lines = [
    "",
    "=".repeat(72),
    "  GENERATED API KEY METADATA",
    "  Save the credential recipients and prefixes from your secure bootstrap flow.",
    "=".repeat(72),
  ];

  for (const record of records) {
    lines.push(`  [seed] API key created for ${record.email} (prefix ${record.prefix})`);
  }

  lines.push("=".repeat(72), "");
  return lines;
}
