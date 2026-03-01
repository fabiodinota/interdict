/**
 * Seed Script - Regulatory Framework Policy Packs
 *
 * Loads all regulatory framework definitions with their Rego policies
 * into PostgreSQL on first deployment. Idempotent -- skips frameworks that
 * already exist by slug.
 *
 * Usage: bun run src/seed/run-seed.ts
 */

import { eq } from "drizzle-orm";
import { db } from "../db/postgres";
import {
  frameworks,
  frameworkPolicies,
  policies,
  policyVersions,
} from "../db/schema/index";
import path from "path";

interface FrameworkPolicyDef {
  file: string;
  requirement_ref: string;
  requirement_description: string;
  is_required: boolean;
  sort_order: number;
}

interface FrameworkDef {
  slug: string;
  name: string;
  description: string;
  jurisdiction: string;
  version: string;
  policies: FrameworkPolicyDef[];
}

const SEED_DIRS = [
  "eu-ai-act",
  "gdpr",
  "nist-ai-rmf",
  "singapore-pdpa",
  "india-dpdp",
  "china-ai-regs",
  "canada-aida-pipeda",
  "gcc",
];

async function seedFramework(frameworkDir: string): Promise<void> {
  const baseDir = path.join(import.meta.dir, frameworkDir);
  const frameworkJsonPath = path.join(baseDir, "framework.json");

  console.log(`[seed] Loading framework from ${frameworkDir}/framework.json`);

  const frameworkJson = await Bun.file(frameworkJsonPath).text();
  const frameworkDef: FrameworkDef = JSON.parse(frameworkJson);

  // Check if framework already exists (idempotent)
  const existing = await db
    .select({ id: frameworks.id })
    .from(frameworks)
    .where(eq(frameworks.slug, frameworkDef.slug))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `[seed] Framework '${frameworkDef.slug}' already exists (id=${existing[0].id}), skipping`
    );
    return;
  }

  console.log(`[seed] Creating framework: ${frameworkDef.name}`);

  // Insert framework
  const [fw] = await db
    .insert(frameworks)
    .values({
      slug: frameworkDef.slug,
      name: frameworkDef.name,
      description: frameworkDef.description,
      jurisdiction: frameworkDef.jurisdiction,
      version: frameworkDef.version,
      isSeeded: true,
    })
    .returning({ id: frameworks.id });

  console.log(`[seed] Framework created: ${frameworkDef.name} (id=${fw.id})`);

  // Seed each policy
  for (const policyDef of frameworkDef.policies) {
    const regoFilePath = path.join(baseDir, policyDef.file);
    const regoSource = await Bun.file(regoFilePath).text();

    // Derive policy name from framework slug and filename
    const fileName = path.basename(policyDef.file, ".rego");
    const policyName = `${frameworkDef.slug}/${fileName}`;

    console.log(`[seed]   Creating policy: ${policyName}`);

    // Insert policy record
    const [policy] = await db
      .insert(policies)
      .values({
        name: policyName,
        description: policyDef.requirement_description,
        isActive: true,
      })
      .returning({ id: policies.id });

    // Insert first policy version with Rego source
    const entrypoint = "interdict/policy/verdict";
    const [version] = await db
      .insert(policyVersions)
      .values({
        policyId: policy.id,
        version: 1,
        regoSource: regoSource,
        entrypoint,
        compilationStatus: "pending",
        changeDescription: `Initial seed from ${frameworkDef.slug} framework`,
      })
      .returning({ id: policyVersions.id });

    // Update policy with current version reference
    await db
      .update(policies)
      .set({ currentVersionId: version.id })
      .where(eq(policies.id, policy.id));

    // Link policy to framework with requirement metadata
    await db.insert(frameworkPolicies).values({
      frameworkId: fw.id,
      policyId: policy.id,
      requirementRef: policyDef.requirement_ref,
      requirementDescription: policyDef.requirement_description,
      isRequired: policyDef.is_required,
      sortOrder: policyDef.sort_order,
    });

    console.log(
      `[seed]   Policy created: ${policyName} (${policyDef.requirement_ref})`
    );
  }

  console.log(
    `[seed] Framework '${frameworkDef.name}' seeded with ${frameworkDef.policies.length} policies`
  );
}

async function main(): Promise<void> {
  console.log("[seed] Starting regulatory framework seed...");
  console.log(`[seed] Seed directories: ${SEED_DIRS.join(", ")}`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const dir of SEED_DIRS) {
    try {
      const baseDir = path.join(import.meta.dir, dir);
      const frameworkJsonPath = path.join(baseDir, "framework.json");

      // Pre-check if already exists to track skips
      const frameworkJson = await Bun.file(frameworkJsonPath).text();
      const frameworkDef: FrameworkDef = JSON.parse(frameworkJson);

      const existing = await db
        .select({ id: frameworks.id })
        .from(frameworks)
        .where(eq(frameworks.slug, frameworkDef.slug))
        .limit(1);

      if (existing.length > 0) {
        skipCount++;
      } else {
        successCount++;
      }

      await seedFramework(dir);
    } catch (error) {
      errorCount++;
      console.error(`[seed] ERROR seeding ${dir}:`, error);
    }
  }

  console.log("[seed] Seed complete!");
  console.log(
    `[seed] Results: ${successCount} created, ${skipCount} skipped (already exist), ${errorCount} errors`
  );

  // Exit cleanly
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
