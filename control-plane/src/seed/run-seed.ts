/**
 * Seed Script - Identity Bootstrap & Regulatory Framework Policy Packs
 *
 * Seeds identity data (departments, users, service accounts, API keys) and regulatory framework definitions with Rego policies
 * into PostgreSQL on first deployment. Idempotent -- skips records that
 * already exist.
 *
 * Identity seed runs FIRST (departments/users must exist before regulatory
 * data for future FK references).
 *
 * Usage: bun run src/seed/run-seed.ts
 */

import { randomBytes } from "node:crypto";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db/postgres";
import {
  apiKeys,
  departments,
  frameworkPolicies,
  frameworks,
  policies,
  policyVersions,
  userDepartments,
  users,
} from "../db/schema/index";
import { buildSeedKeyOutput } from "./key-output";

// ---------------------------------------------------------------------------
// Identity Seed Types
// ---------------------------------------------------------------------------

interface IdentitySeedData {
  departments: Array<{ name: string; displayName: string }>;
  users: Array<{
    email: string;
    displayName: string;
    role: string;
    departments: string[];
  }>;
  serviceAccounts: Array<{
    email: string;
    displayName: string;
  }>;
  defaultPermissions: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Identity Seeding
// ---------------------------------------------------------------------------

/**
 * Generates an API key with the ik_live_ prefix.
 * Returns plaintext, SHA-256 hash (stored), and display prefix.
 */
function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const plaintext = `ik_live_${random}`;

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(plaintext);
  const hash = hasher.digest("hex");

  const prefix = plaintext.substring(0, 16); // "ik_live_XXXXXXXX"

  return { plaintext, hash, prefix };
}

/**
 * Seeds identity data: departments, users, service accounts, API keys,
 * user-department memberships.
 *
 * Idempotent: skips existing records by unique key (name/email/role+permission).
 * API keys are only generated for users that have no existing keys.
 */
async function seedIdentity(): Promise<void> {
  console.log("[seed] Starting identity seed...");

  const seedPath = path.join(import.meta.dir, "identity-seed.json");
  const seedJson = await Bun.file(seedPath).text();
  const seedData: IdentitySeedData = JSON.parse(seedJson);

  // 1. Seed departments
  console.log(`[seed] Seeding ${seedData.departments.length} departments...`);
  const departmentMap = new Map<string, string>(); // name -> id

  for (const dept of seedData.departments) {
    const existing = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.name, dept.name))
      .limit(1);

    if (existing.length > 0) {
      departmentMap.set(dept.name, existing[0].id);
      console.log(`[seed]   Department '${dept.name}' already exists, skipping`);
      continue;
    }

    const [inserted] = await db
      .insert(departments)
      .values({
        name: dept.name,
        displayName: dept.displayName,
      })
      .returning({ id: departments.id });

    departmentMap.set(dept.name, inserted.id);
    console.log(`[seed]   Department created: ${dept.displayName} (id=${inserted.id})`);
  }

  // 2. Seed users (human)
  console.log(`[seed] Seeding ${seedData.users.length} users...`);
  const generatedKeys: Array<{ email: string; prefix: string }> = [];

  for (const userData of seedData.users) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      console.log(`[seed]   User '${userData.email}' already exists, skipping insert`);
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          email: userData.email,
          displayName: userData.displayName,
          role: userData.role,
          isService: false,
          isActive: true,
        })
        .returning({ id: users.id });

      userId = inserted.id;
      console.log(`[seed]   User created: ${userData.email} (role=${userData.role})`);
    }

    // Insert user-department memberships
    for (const deptName of userData.departments) {
      const deptId = departmentMap.get(deptName);
      if (!deptId) {
        console.warn(
          `[seed]   WARNING: Department '${deptName}' not found for user '${userData.email}'`,
        );
        continue;
      }

      const existingLink = await db
        .select({ userId: userDepartments.userId })
        .from(userDepartments)
        .where(and(eq(userDepartments.userId, userId), eq(userDepartments.departmentId, deptId)))
        .limit(1);

      if (existingLink.length === 0) {
        await db.insert(userDepartments).values({
          userId,
          departmentId: deptId,
        });
        console.log(`[seed]   Linked user '${userData.email}' to department '${deptName}'`);
      }
    }

    // Generate API key if user has none
    const existingKeys = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .limit(1);

    if (existingKeys.length === 0) {
      const { hash, prefix } = generateApiKey();
      await db.insert(apiKeys).values({
        userId,
        keyHash: hash,
        keyPrefix: prefix,
        label: "Initial seed key",
        isActive: true,
      });
      generatedKeys.push({ email: userData.email, prefix });
    }
  }

  // 3. Seed service accounts
  console.log(`[seed] Seeding ${seedData.serviceAccounts.length} service accounts...`);

  for (const svc of seedData.serviceAccounts) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, svc.email))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      console.log(`[seed]   Service account '${svc.email}' already exists, skipping insert`);
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          email: svc.email,
          displayName: svc.displayName,
          role: "super_admin",
          isService: true,
          isActive: true,
        })
        .returning({ id: users.id });

      userId = inserted.id;
      console.log(`[seed]   Service account created: ${svc.email}`);
    }

    // Generate API key if service account has none
    const existingKeys = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .limit(1);

    if (existingKeys.length === 0) {
      const { hash, prefix } = generateApiKey();
      await db.insert(apiKeys).values({
        userId,
        keyHash: hash,
        keyPrefix: prefix,
        label: "Service account seed key",
        isActive: true,
      });
      generatedKeys.push({ email: svc.email, prefix });
    }
  }

  // 4. Print generated API key metadata without revealing secrets
  if (generatedKeys.length > 0) {
    for (const line of buildSeedKeyOutput(generatedKeys)) {
      console.log(line);
    }
  }

  console.log("[seed] Identity seed complete.");
}

// ---------------------------------------------------------------------------
// Regulatory Framework Seeding (unchanged from Phase 5)
// ---------------------------------------------------------------------------

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
      `[seed] Framework '${frameworkDef.slug}' already exists (id=${existing[0].id}), skipping`,
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

    console.log(`[seed]   Policy created: ${policyName} (${policyDef.requirement_ref})`);
  }

  console.log(
    `[seed] Framework '${frameworkDef.name}' seeded with ${frameworkDef.policies.length} policies`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Phase 1: Identity seed (must run first) ---
  try {
    await seedIdentity();
  } catch (error) {
    console.error("[seed] ERROR in identity seed:", error);
    process.exit(1);
  }

  // --- Phase 2: Regulatory framework seed ---
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
    `[seed] Results: ${successCount} created, ${skipCount} skipped (already exist), ${errorCount} errors`,
  );

  // Exit cleanly
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
