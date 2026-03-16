# T03: Department self-referencing FK and dead code removal

## Description

Add the missing self-referencing FK on `departments.parentDepartmentId` and remove the `rolePermissions` table that is defined in the schema and populated by the seed script but never read at runtime. Generate a Drizzle migration for both changes.

## Slice Context

**Goal:** Department schema has self-referencing FK. Dead code removed (`rolePermissions` table, unused seed logic).

**Verification:** `cd control-plane && bun test` passes. `rg "rolePermissions" control-plane/src/` returns zero hits. Migration SQL file exists with FK + table drop.

## Steps

1. **Add self-referencing FK in `control-plane/src/db/schema/organization.ts`:**
   - The `departments` table has `parentDepartmentId: uuid("parent_department_id")` at approximately line 17 — currently with no `.references()` call, just a comment saying "self-referencing FK".
   - Add `.references(() => departments.id, { onDelete: "set null" })` to the column chain.
   - Must use `onDelete: "set null"` (not cascade) to avoid recursive deletion of the entire department tree when a parent is removed.
   - Drizzle supports self-referencing FKs with this pattern (the arrow function defers resolution).

2. **Remove `rolePermissions` table from `control-plane/src/db/schema/auth.ts`:**
   - The `rolePermissions` table definition starts at line ~155.
   - Delete the entire `export const rolePermissions = pgTable(...)` block.
   - This table is dead code — `permissions.ts` uses `DEFAULT_PERMISSIONS` (in-memory), never queries this table.
   - Check if there are any other references to `rolePermissions` in `auth.ts` (e.g., relations or type exports) and remove those too.

3. **Remove `rolePermissions` re-export from `control-plane/src/db/schema/index.ts`:**
   - Line ~11 re-exports `rolePermissions`. Remove it from the export list.

4. **Remove `rolePermissions` seed logic from `control-plane/src/seed/run-seed.ts`:**
   - Line ~26: remove the `rolePermissions` import from the schema import statement.
   - Lines ~249-255: remove the seed block that inserts into `rolePermissions`. The block checks for existing entries and inserts new ones — remove the entire block.
   - If the block is inside a loop over roles/permissions, remove only the `rolePermissions`-specific parts.

5. **Verify no remaining references:**
   ```bash
   rg "rolePermissions" control-plane/src/
   ```
   Must return zero hits. If any other files reference it (types, relations, tests), remove those references too.

6. **Generate Drizzle migration:**
   ```bash
   cd control-plane && bun run db:generate
   ```
   - This should produce a new `.sql` file in `control-plane/drizzle/` (or wherever Drizzle is configured to output).
   - Inspect the generated SQL. Expect:
     - `ALTER TABLE "departments" ADD CONSTRAINT ... FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL`
     - `DROP TABLE "role_permissions"`
   - If the migration contains unexpected changes (other tables being altered), investigate before proceeding.

7. **Run full test suite:**
   ```bash
   cd control-plane && bun test
   ```
   - All tests should pass. No tests should depend on `rolePermissions` since the table was never queried at runtime.

## Must-Haves

- `parentDepartmentId` has `.references(() => departments.id, { onDelete: "set null" })`
- `rolePermissions` table definition, re-export, and seed logic completely removed
- Migration SQL file generated with correct ALTER + DROP statements
- Zero remaining `rolePermissions` references in `control-plane/src/`
- Full `bun test` passes

## Verification

```bash
cd control-plane && bun test
```

All tests pass.

```bash
rg "rolePermissions" control-plane/src/
```

Returns zero hits.

```bash
ls control-plane/drizzle/
```

New migration SQL file exists.

## Observability Impact

- **Schema change:** The self-referencing FK on `departments.parentDepartmentId` will cause Postgres to raise a constraint violation (23503) on `INSERT`/`UPDATE` if the referenced parent department doesn't exist, and will `SET NULL` on child rows when a parent is deleted — both visible via standard Postgres error logs.
- **Dead code removal:** `rolePermissions` table drop is a one-way migration. If any external tool or legacy query references `role_permissions`, it will surface as a Postgres "relation does not exist" error (42P01). No runtime code references this table, so no application-level signals change.
- **Migration inspection:** `ls control-plane/drizzle/` shows the generated migration file; the SQL can be reviewed for expected `ALTER TABLE` + `DROP TABLE` statements.

## Inputs

- `control-plane/src/db/schema/organization.ts` — `departments` table with `parentDepartmentId` at ~line 17
- `control-plane/src/db/schema/auth.ts` — `rolePermissions` table at ~line 155
- `control-plane/src/db/schema/index.ts` — re-exports `rolePermissions` at ~line 11
- `control-plane/src/seed/run-seed.ts` — imports and populates `rolePermissions` at lines ~26, ~249-255
- Drizzle migration config in `control-plane/drizzle.config.ts`

## Expected Output

- Updated `organization.ts` with self-referencing FK
- `rolePermissions` removed from `auth.ts`, `index.ts`, and `run-seed.ts`
- New migration SQL file in `control-plane/drizzle/`
- Zero `rolePermissions` references in codebase
- Full `bun test` passes
