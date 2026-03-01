# Phase 5: Control Plane API Core - Research

**Researched:** 2026-03-01
**Domain:** Bun + Elysia REST API, PostgreSQL schema, ClickHouse analytics queries, OPA Rego-to-Wasm compilation, regulatory framework mapping
**Confidence:** MEDIUM-HIGH

## Summary

Phase 5 introduces the first TypeScript service into the Interdict codebase: a Bun + Elysia REST API that serves as the control plane for policy management, vendor registry, regulatory framework mapping, and audit trail querying. The API writes configuration to PostgreSQL and reads high-volume analytics from ClickHouse, maintaining strict separation between the two databases. Policy compilation uses the OPA CLI (`opa build -t wasm`) as an external subprocess to transform Rego source into Wasm bundles, which must be compatible with the kernel's Wasmtime pooling allocator (1MB max memory per slot). SSE streaming provides real-time audit event monitoring by polling ClickHouse on an interval.

The stack is well-established: Elysia 1.4.x provides type-safe routing with built-in OpenAPI generation, Drizzle ORM provides type-safe PostgreSQL access with migration support, and the official `@clickhouse/client` works in Bun (since v1.1.6+). The primary integration risk is the OPA CLI as an external binary dependency -- it must be bundled or documented as a prerequisite, and its compilation output must produce Wasm modules compatible with the kernel's existing Wasmtime runtime.

**Primary recommendation:** Use Elysia with TypeBox validation as the single source of truth for types, Drizzle ORM with `postgres.js` for PostgreSQL, `@clickhouse/client` (Node.js variant) for ClickHouse reads, and shell out to `opa build` for Rego-to-Wasm compilation with structured error handling.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Compiled Wasm module storage approach is Claude's discretion (BYTEA blob vs filesystem + DB reference)
- Full version history for policies -- every edit creates a new version, previous versions are queryable and restorable for compliance auditing ("what policy was active at time X?")
- Vendor registry uses a vendor + model version table for granular per-model control (e.g., OpenAI: gpt-4, gpt-4-turbo approved; gpt-3.5 blocked)
- Organizational structure (departments, teams, users tables) included in Phase 5 schema to avoid migrations later, even though department-scoped policy enforcement arrives in Phase 6
- Bundle of tagged policies -- each framework (EU AI Act, GDPR, etc.) is a collection of policies tagged with framework metadata. Selecting a framework enables all its tagged policies. Individual policies can be toggled off
- Seed common frameworks (EU AI Act, GDPR) on first deployment; less common frameworks (Singapore PDPA, India DPDP, etc.) available as on-demand imports
- Enabling a framework is additive -- framework policies layer alongside existing custom policies, no override/conflict resolution
- Full Rego policies per regulatory requirement -- each requirement gets a working Rego policy that enforces it, functional out of the box
- Compilation is asynchronous -- save returns immediately with "compiling" status, background worker compiles and updates status
- OPA CLI (`opa build`) for Rego-to-Wasm compilation -- battle-tested, native Rego-to-Wasm support, external binary dependency
- Pre-validation of Rego syntax before compilation, returning structured friendly error messages (line number, expected token, etc.)
- Rego only as policy source language -- no YAML alternative. The dashboard visual builder (Phase 8) will handle accessibility for non-technical users
- Cursor-based pagination using timestamp + bundle_id for efficient forward/backward paging across millions of records
- Enriched responses -- join ClickHouse evidence data with PostgreSQL data (policy names, user display names, department labels, vendor metadata) for human-readable API responses
- SSE streaming endpoint for real-time audit event monitoring included in Phase 5
- Pre-built aggregate endpoints for summary stats + time series leveraging existing materialized views (mv_hourly_violations, mv_vendor_usage, mv_department_summary)

### Claude's Discretion
- Wasm module storage approach (BYTEA in PostgreSQL vs filesystem + DB reference)
- Elysia project structure and middleware patterns
- Database migration tooling choice
- Error handling and response format conventions
- Testing strategy and framework selection
- SSE streaming implementation details (polling ClickHouse vs event-driven)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRL-01 | Policy CRUD API -- create, read, update, delete policies with Rego source | Elysia route patterns, Drizzle ORM schema for policy versioning, TypeBox validation for Rego source input |
| CTRL-02 | Policy compiler transforms Rego rules into compiled Wasm modules | OPA CLI `opa build -t wasm -e` subprocess, async compilation worker, structured error parsing |
| CTRL-04 | Vendor registry API -- CRUD for approved/blocked AI vendors with per-vendor model version allowlists | Drizzle schema with vendors + vendor_models tables, TypeBox validation |
| CTRL-05 | Regulatory framework mapping engine -- selecting a jurisdiction auto-enables corresponding policy configurations | Framework-to-policy tagging schema, seed data for EU AI Act + GDPR, additive enable/disable logic |
| CTRL-06 | Pre-built regulatory policy packs for EU AI Act, GDPR, and other frameworks | Seed migration with working Rego policies per regulatory requirement, framework metadata tagging |
| CTRL-07 | Audit trail query API -- searchable, filterable execution history | ClickHouse queries against `evidence_bundles` table, cursor pagination with timestamp+bundle_id, enrichment joins with PostgreSQL |
| CTRL-10 | PostgreSQL for configuration, policies, users, vendor registry, regulatory mappings | Drizzle ORM schema definition, drizzle-kit migrations, connection pooling |
| CTRL-11 | ClickHouse for high-volume audit log analytics and compliance reporting | `@clickhouse/client` in Bun, materialized view queries, streaming result sets |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun | 1.3.x | JavaScript runtime | Fastest JS runtime; native PostgreSQL driver; native TypeScript support |
| elysia | 1.4.x | HTTP framework | Type-safe routing with end-to-end inference; built-in OpenAPI generation; SSE support via generators |
| drizzle-orm | 0.45.x | PostgreSQL ORM | Type-safe SQL queries; Bun SQL driver support; schema-as-code with migration generation |
| drizzle-kit | latest | Migration CLI | `generate` + `migrate` commands; schema diffing; `drizzle-kit studio` for DB inspection |
| @clickhouse/client | latest | ClickHouse client | Official client; parameterized queries; streaming result sets; works in Bun since v1.1.6 |
| drizzle-typebox | latest | Schema-to-validation bridge | Converts Drizzle schemas to TypeBox models compatible with Elysia's type system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| postgres (postgres.js) | latest | PostgreSQL wire driver | Underlying driver for drizzle-orm/postgres-js; built-in connection pooling |
| @sinclair/typebox | 0.32.x | Schema validation | Pin to match Elysia's dependency version; used via Elysia.t for request/response validation |
| zod | latest | Additional validation | For internal validation where TypeBox is awkward (config parsing, env vars) |
| dotenv / bun built-in | - | Environment variables | Bun loads .env natively; no extra dependency needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma | Prisma has heavier runtime, slower cold start, less SQL control; Drizzle is lighter and more SQL-native |
| Drizzle ORM | Bun native SQL | No migration tooling, no type-safe query builder, no schema-as-code; fine for raw queries but not for CRUD-heavy control plane |
| @clickhouse/client | clickhouse-ts | Unofficial; less maintained; official client has streaming and parameterized query support |
| postgres.js | Bun SQL native driver | Bun SQL is newer, drizzle-orm/bun-sql support exists but postgres.js is more battle-tested and has explicit pool config |
| OPA CLI subprocess | @open-policy-agent/opa-wasm (npm) | npm package only evaluates pre-compiled Wasm; doesn't compile Rego to Wasm -- OPA CLI is the only way to build Wasm bundles |

**Installation:**
```bash
bun add elysia drizzle-orm drizzle-typebox postgres @clickhouse/client @sinclair/typebox
bun add -D drizzle-kit typescript @types/bun
```

**TypeBox version pinning (package.json):**
```json
{
  "overrides": {
    "@sinclair/typebox": "0.32.4"
  }
}
```

## Architecture Patterns

### Recommended Project Structure
```
control-plane/
├── src/
│   ├── index.ts                    # Elysia app entry, plugin composition
│   ├── config.ts                   # Environment config validation
│   ├── db/
│   │   ├── postgres.ts             # Drizzle + postgres.js connection
│   │   ├── clickhouse.ts           # ClickHouse client singleton
│   │   ├── schema/
│   │   │   ├── policies.ts         # policies, policy_versions tables
│   │   │   ├── vendors.ts          # vendors, vendor_models tables
│   │   │   ├── regulatory.ts       # frameworks, framework_policies tables
│   │   │   ├── organization.ts     # departments, teams, users tables
│   │   │   └── index.ts            # Re-export all schemas
│   │   └── migrations/             # Generated by drizzle-kit
│   ├── modules/
│   │   ├── policies/
│   │   │   ├── index.ts            # Elysia plugin (controller)
│   │   │   ├── service.ts          # Business logic
│   │   │   └── model.ts            # TypeBox schemas for req/res
│   │   ├── vendors/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── model.ts
│   │   ├── regulatory/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── model.ts
│   │   ├── audit/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   ├── model.ts
│   │   │   └── queries.ts          # ClickHouse query builders
│   │   └── compiler/
│   │       ├── index.ts            # Compilation status endpoints
│   │       ├── worker.ts           # Background OPA build worker
│   │       └── validator.ts        # Rego syntax pre-validation
│   ├── shared/
│   │   ├── errors.ts               # Custom error classes
│   │   ├── pagination.ts           # Cursor pagination helpers
│   │   └── response.ts             # Standard response envelope
│   └── seed/
│       ├── eu-ai-act/              # EU AI Act Rego policies
│       ├── gdpr/                   # GDPR Rego policies
│       └── run-seed.ts             # First-deployment seed script
├── drizzle.config.ts               # Drizzle-kit configuration
├── package.json
├── tsconfig.json
└── bunfig.toml                     # Bun configuration
```

### Pattern 1: Elysia Plugin-per-Module
**What:** Each feature module exports an Elysia instance that is composed into the main app via `.use()`.
**When to use:** Always -- this is Elysia's recommended pattern for route organization.
**Example:**
```typescript
// src/modules/policies/index.ts
import { Elysia, t } from 'elysia'
import { PolicyService } from './service'

export const policiesModule = new Elysia({ prefix: '/api/v1/policies' })
  .post('/', async ({ body }) => {
    return PolicyService.create(body)
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 255 }),
      description: t.String(),
      rego_source: t.String({ minLength: 1 }),
      framework_tags: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      id: t.String({ format: 'uuid' }),
      version: t.Integer(),
      compilation_status: t.Union([
        t.Literal('pending'),
        t.Literal('compiling'),
        t.Literal('compiled'),
        t.Literal('failed'),
      ]),
    }),
  })
  .get('/:id', async ({ params }) => {
    return PolicyService.getById(params.id)
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
  })
  .get('/:id/versions', async ({ params }) => {
    return PolicyService.getVersionHistory(params.id)
  })

// src/index.ts
import { Elysia } from 'elysia'
import { policiesModule } from './modules/policies'
import { vendorsModule } from './modules/vendors'
import { regulatoryModule } from './modules/regulatory'
import { auditModule } from './modules/audit'

const app = new Elysia()
  .use(policiesModule)
  .use(vendorsModule)
  .use(regulatoryModule)
  .use(auditModule)
  .listen(3000)
```

### Pattern 2: Async Compilation Worker
**What:** Policy saves return immediately; a background worker handles OPA compilation.
**When to use:** All policy create/update operations.
**Example:**
```typescript
// src/modules/compiler/worker.ts
import { $ } from 'bun'

interface CompilationJob {
  policyVersionId: string
  regoSource: string
  entrypoint: string
}

export async function compilePolicy(job: CompilationJob): Promise<{
  success: boolean
  wasmBytes?: Uint8Array
  error?: string
}> {
  // Write Rego source to temp file
  const tmpDir = await Bun.mktemp({ prefix: 'opa-' })
  const regoPath = `${tmpDir}/policy.rego`
  await Bun.write(regoPath, job.regoSource)

  try {
    // OPA build: Rego -> Wasm bundle (tar.gz containing policy.wasm)
    const result = await $`opa build -t wasm -e ${job.entrypoint} ${regoPath} -o ${tmpDir}/bundle.tar.gz`
      .quiet()
      .nothrow()

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr.toString(),
      }
    }

    // Extract policy.wasm from the tar.gz bundle
    await $`tar -xzf ${tmpDir}/bundle.tar.gz -C ${tmpDir}`.quiet()
    const wasmBytes = await Bun.file(`${tmpDir}/policy.wasm`).arrayBuffer()

    return {
      success: true,
      wasmBytes: new Uint8Array(wasmBytes),
    }
  } finally {
    // Cleanup temp directory
    await $`rm -rf ${tmpDir}`.quiet().nothrow()
  }
}
```

### Pattern 3: Cursor-Based Pagination for ClickHouse Audit Queries
**What:** Use timestamp + bundle_id as a composite cursor for stable pagination across large result sets.
**When to use:** All audit trail list/search endpoints.
**Example:**
```typescript
// src/modules/audit/queries.ts
interface AuditCursor {
  timestamp: number  // epoch millis
  bundleId: string
}

function decodeCursor(cursor: string): AuditCursor {
  const decoded = Buffer.from(cursor, 'base64url').toString()
  const [ts, id] = decoded.split('|')
  return { timestamp: parseInt(ts, 10), bundleId: id }
}

function encodeCursor(timestamp: number, bundleId: string): string {
  return Buffer.from(`${timestamp}|${bundleId}`).toString('base64url')
}

async function queryAuditTrail(
  client: ClickHouseClient,
  filters: AuditFilters,
  cursor?: string,
  limit: number = 50
) {
  const conditions: string[] = []
  const params: Record<string, unknown> = { limit: limit + 1 }

  if (cursor) {
    const c = decodeCursor(cursor)
    conditions.push('(timestamp < {cursor_ts:DateTime64(3)} OR (timestamp = {cursor_ts:DateTime64(3)} AND bundle_id < {cursor_id:String}))')
    params.cursor_ts = c.timestamp
    params.cursor_id = c.bundleId
  }

  if (filters.vendor) {
    conditions.push('vendor = {vendor:String}')
    params.vendor = filters.vendor
  }
  if (filters.policyAction) {
    conditions.push('policy_action = {policy_action:String}')
    params.policy_action = filters.policyAction
  }
  // ... additional filters for department, actor_identity, time range

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const resultSet = await client.query({
    query: `SELECT * FROM evidence_bundles ${where} ORDER BY timestamp DESC, bundle_id DESC LIMIT {limit:UInt32}`,
    format: 'JSONEachRow',
    query_params: params,
  })

  const rows = await resultSet.json()
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore
    ? encodeCursor(items[items.length - 1].timestamp, items[items.length - 1].bundle_id)
    : null

  return { items, nextCursor, hasMore }
}
```

### Pattern 4: SSE Streaming with Elysia Generators
**What:** Real-time audit event stream using Elysia's built-in SSE support with generator functions.
**When to use:** The `/api/v1/audit/stream` endpoint for live monitoring.
**Example:**
```typescript
// src/modules/audit/index.ts
import { Elysia, sse } from 'elysia'

export const auditModule = new Elysia({ prefix: '/api/v1/audit' })
  .get('/stream', function* ({ query }) {
    // Poll ClickHouse at interval for new events
    const pollIntervalMs = 2000
    let lastTimestamp = Date.now()

    while (true) {
      const newEvents = yield* pollNewEvents(lastTimestamp, query.filters)
      for (const event of newEvents) {
        yield sse({
          event: 'audit-event',
          data: JSON.stringify(event),
        })
        lastTimestamp = event.timestamp
      }
      // Wait before next poll
      yield new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }
  })
```

### Pattern 5: PostgreSQL Schema with Full Version History
**What:** Every policy edit creates a new version row. The `policies` table holds the latest pointer; `policy_versions` holds all historical versions.
**When to use:** Policy CRUD operations.
**Example:**
```typescript
// src/db/schema/policies.ts
import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core'

export const compilationStatusEnum = pgEnum('compilation_status', [
  'pending', 'compiling', 'compiled', 'failed'
])

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').default(''),
  currentVersionId: uuid('current_version_id'),  // FK to policy_versions
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),  // FK to users (Phase 7 enforced)
})

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  version: integer('version').notNull(),         // auto-incrementing per policy
  regoSource: text('rego_source').notNull(),
  entrypoint: varchar('entrypoint', { length: 512 }).notNull(),
  compilationStatus: compilationStatusEnum('compilation_status').notNull().default('pending'),
  compilationError: text('compilation_error'),
  wasmBytes: text('wasm_bytes'),                 // base64 or bytea -- see Discretion section
  wasmHash: varchar('wasm_hash', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),
  changeDescription: text('change_description'),
})
```

### Anti-Patterns to Avoid
- **Mixing PostgreSQL and ClickHouse roles:** Never store audit log data in PostgreSQL or policy configuration in ClickHouse. PostgreSQL = config/CRUD; ClickHouse = analytics/audit reads.
- **Synchronous compilation:** Never block the HTTP response waiting for `opa build`. Compilation can take seconds; return immediately with "compiling" status.
- **Passing entire Elysia Context to services:** Destructure what you need. Services should be framework-agnostic where possible.
- **Full table scans on ClickHouse `evidence_bundles`:** Always use the materialized views for aggregate queries. The raw table is partitioned by date and ordered by `(kernel_id, sequence_number)` -- full scans are expensive.
- **Unbounded result sets:** Always enforce cursor pagination on ClickHouse queries. Even with sub-second response times, returning millions of rows will OOM the process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database migrations | Custom SQL migration scripts | drizzle-kit `generate` + `migrate` | Schema diffing, rollback support, version tracking, team collaboration |
| Rego-to-Wasm compilation | Custom Rego parser/compiler | OPA CLI `opa build -t wasm` | Rego language is complex; OPA is the canonical compiler; any custom parser will miss edge cases |
| Rego syntax validation | Custom Rego tokenizer | OPA CLI `opa check --strict` | Returns structured errors with line numbers; handles import resolution |
| Request validation | Manual type checking | Elysia TypeBox schemas | Runtime + compile-time + OpenAPI generation from single schema definition |
| API documentation | Manual OpenAPI YAML | Elysia built-in OpenAPI | Elysia generates OpenAPI spec from route type definitions automatically |
| Connection pooling | Custom pool manager | postgres.js built-in pool | Handles reconnection, idle timeout, max connections, health checks |
| Cursor encoding | Custom binary format | Base64url-encoded `timestamp|bundle_id` | Simple, debuggable, no external dependency; standard API pattern |

**Key insight:** This phase is CRUD-heavy control plane code. The complexity is in schema design and data flow correctness, not in novel algorithms. Use established libraries for all infrastructure concerns and focus implementation effort on the domain logic: policy versioning, regulatory mappings, and cross-database enrichment.

## Common Pitfalls

### Pitfall 1: OPA CLI Not Found at Runtime
**What goes wrong:** The `opa build` command fails because the OPA binary is not installed in the deployment environment.
**Why it happens:** OPA CLI is an external binary dependency (Go-compiled), not an npm package. It must be explicitly installed.
**How to avoid:** Check for `opa` in PATH at startup. Fail fast with a clear error message. Include OPA binary installation in Dockerfile and development setup docs. Consider bundling the binary or downloading it at build time.
**Warning signs:** Compilation jobs silently fail; policies stay in "compiling" status forever.

### Pitfall 2: Wasm Module Size Exceeding Kernel Memory Limit
**What goes wrong:** Compiled Wasm modules exceed the kernel's 1MB `wasm_max_memory_bytes` Wasmtime pooling allocator slot size.
**Why it happens:** Complex Rego policies with many rules or large data embeddings produce larger Wasm modules.
**How to avoid:** After OPA compilation, check the Wasm module size. If it exceeds the configured limit (default 1MB), mark compilation as failed with a descriptive error. Log the compiled size for monitoring.
**Warning signs:** Kernel panics or rejects policy loads with memory allocation errors.

### Pitfall 3: ClickHouse Query Timeouts on Unindexed Filters
**What goes wrong:** Audit trail queries filtering on non-LowCardinality columns (e.g., `actor_identity`, `bundle_id`) are slow on large datasets.
**Why it happens:** The `evidence_bundles` table is ordered by `(kernel_id, sequence_number)`. Queries that don't align with this ordering or partition key (`toYYYYMMDD(event_date)`) require full scans of matching partitions.
**How to avoid:** Always include date range filters to prune partitions. Use LowCardinality columns (department, vendor, model, policy_action) as primary filters. For actor_identity lookups, consider adding a secondary index or materializing a per-actor view.
**Warning signs:** Audit queries exceeding 1 second; ClickHouse memory usage spikes.

### Pitfall 4: TypeBox Version Mismatch Between Elysia and Drizzle-TypeBox
**What goes wrong:** Runtime crashes or infinite type instantiation errors due to conflicting TypeBox versions.
**Why it happens:** Elysia pins a specific TypeBox version internally. If drizzle-typebox pulls a different version, TypeBox's singleton pattern breaks.
**How to avoid:** Pin `@sinclair/typebox` in package.json `overrides` to match Elysia's dependency version. Verify with `bun pm ls @sinclair/typebox` that only one version is resolved.
**Warning signs:** TypeScript compilation errors mentioning "Type instantiation is excessively deep"; runtime "Invalid schema" errors.

### Pitfall 5: PostgreSQL Connection Pool Exhaustion
**What goes wrong:** API requests start timing out because all PostgreSQL connections are in use.
**Why it happens:** Default postgres.js pool size is 10. Under load with slow queries or long transactions (e.g., policy compilation callbacks), connections are held too long.
**How to avoid:** Set explicit pool size (`max: 20` or higher based on expected concurrency). Keep transactions short. Use connection timeouts. Monitor pool utilization.
**Warning signs:** Increasing request latency; "remaining connection slots are reserved" errors.

### Pitfall 6: SSE Connection Leak
**What goes wrong:** SSE connections accumulate over time as clients disconnect without proper cleanup.
**Why it happens:** Client disconnections may not trigger the generator cleanup if not handled properly.
**How to avoid:** Elysia automatically stops generator functions when clients cancel requests. Verify this behavior in integration tests. Set a maximum SSE connection duration and reconnect on the client side.
**Warning signs:** Memory growth over time; increasing open connection count.

### Pitfall 7: Enrichment N+1 Queries
**What goes wrong:** Audit trail responses are slow because each ClickHouse row triggers a PostgreSQL lookup for policy names, user display names, etc.
**Why it happens:** Naive implementation fetches ClickHouse rows then loops to enrich each one.
**How to avoid:** Batch enrichment: collect all unique policy IDs, user IDs, vendor IDs from the ClickHouse result set, then do ONE PostgreSQL query per entity type. Cache frequently-accessed entities (policy names, vendor names) in-memory with short TTL.
**Warning signs:** Audit API latency that scales linearly with page size.

## Code Examples

### ClickHouse Materialized View Query (Hourly Violations)
```typescript
// Source: existing evidence-collector schema (crates/evidence-collector/src/storage/clickhouse.rs)
// Query aligns with mv_hourly_violations materialized view

async function getHourlyViolations(
  client: ClickHouseClient,
  from: Date,
  to: Date
) {
  const resultSet = await client.query({
    query: `
      SELECT
        hour,
        policy_action,
        violation_count,
        unique_actors,
        unique_vendors
      FROM mv_hourly_violations
      WHERE hour >= {from:DateTime}
        AND hour <= {to:DateTime}
      ORDER BY hour ASC
    `,
    format: 'JSONEachRow',
    query_params: { from: from.toISOString(), to: to.toISOString() },
  })

  return resultSet.json()
}
```

### Drizzle Schema with Version History
```typescript
// Source: Drizzle ORM docs (orm.drizzle.team)
import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, boolean, uniqueIndex } from 'drizzle-orm/pg-core'

export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('approved'), // approved | blocked
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const vendorModels = pgTable('vendor_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  modelName: varchar('model_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('approved'), // approved | blocked
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  vendorModelUnique: uniqueIndex('vendor_model_unique').on(table.vendorId, table.modelName),
}))
```

### Rego Pre-Validation via OPA Check
```typescript
// Source: OPA CLI Reference (openpolicyagent.org/docs/cli)
import { $ } from 'bun'

interface ValidationResult {
  valid: boolean
  errors?: Array<{
    message: string
    line?: number
    column?: number
  }>
}

async function validateRego(regoSource: string): Promise<ValidationResult> {
  const tmpFile = `/tmp/opa-validate-${crypto.randomUUID()}.rego`
  await Bun.write(tmpFile, regoSource)

  try {
    const result = await $`opa check --strict --format json ${tmpFile}`
      .quiet()
      .nothrow()

    if (result.exitCode === 0) {
      return { valid: true }
    }

    // Parse OPA check output for structured errors
    const stderr = result.stderr.toString()
    try {
      const parsed = JSON.parse(stderr)
      return {
        valid: false,
        errors: parsed.errors?.map((e: any) => ({
          message: e.message,
          line: e.location?.row,
          column: e.location?.col,
        })),
      }
    } catch {
      return {
        valid: false,
        errors: [{ message: stderr.trim() }],
      }
    }
  } finally {
    await $`rm -f ${tmpFile}`.quiet().nothrow()
  }
}
```

### Drizzle + Elysia Integration Pattern
```typescript
// Source: elysiajs.com/integrations/drizzle
import { Elysia } from 'elysia'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './db/schema'

const queryClient = postgres(process.env.DATABASE_URL!, { max: 20 })
const db = drizzle(queryClient, { schema })

// Inject db via Elysia decorator
const app = new Elysia()
  .decorate('db', db)
  .use(policiesModule)
  .use(vendorsModule)
  .listen(3000)
```

### Standard API Response Envelope
```typescript
// src/shared/response.ts
import { t } from 'elysia'

// Success response
export function apiResponse<T>(data: T, meta?: Record<string, unknown>) {
  return {
    success: true as const,
    data,
    meta: meta ?? {},
  }
}

// Paginated response with cursor
export function paginatedResponse<T>(
  items: T[],
  nextCursor: string | null,
  total?: number
) {
  return {
    success: true as const,
    data: items,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      ...(total !== undefined ? { total } : {}),
    },
  }
}

// Error response
export function apiError(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, details },
  }
}
```

## Discretion Recommendations

### Wasm Module Storage: Filesystem + DB Reference (RECOMMENDED)
**Recommendation:** Store compiled Wasm bytes on the filesystem with a reference (path + hash) in PostgreSQL.
**Reasoning:**
- Wasm binaries are opaque blobs (typically 100KB-1MB) that benefit from filesystem caching and direct I/O.
- PostgreSQL BYTEA works but adds MVCC overhead on every version read, increases backup sizes, and makes it harder to serve Wasm to kernels efficiently in Phase 6 (gRPC streaming).
- Filesystem approach: write to `data/wasm/{policy_id}/{version}.wasm`, store path + SHA-256 hash in `policy_versions` table.
- Cleanup on policy deletion is straightforward -- delete the directory.
- Air-gapped and sidecar deployments can mount the directory as a shared volume.

### Database Migration Tooling: drizzle-kit (RECOMMENDED)
**Recommendation:** Use drizzle-kit for all schema migrations.
**Reasoning:**
- Schema-as-code in TypeScript aligns with the rest of the control plane codebase.
- `drizzle-kit generate` produces SQL migration files from schema diffs.
- `drizzle-kit migrate` applies migrations in order.
- `drizzle-kit studio` provides a web UI for database inspection during development.
- No additional runtime dependency (migrations are SQL files).

### Error Handling: Structured API Errors with Error Classes (RECOMMENDED)
**Recommendation:** Define custom error classes and a global error handler.
**Reasoning:**
- Elysia's `onError` hook provides global error handling.
- Custom error classes (e.g., `NotFoundError`, `ValidationError`, `CompilationError`) carry HTTP status codes and structured error payloads.
- Consistent `{ success: false, error: { code, message, details } }` envelope across all error responses.

### Testing Strategy: bun:test + Supertest-style (RECOMMENDED)
**Recommendation:** Use `bun:test` (built-in) with Elysia's `.handle()` method for API testing. No need for an external test runner.
**Reasoning:**
- `bun:test` is built into Bun, zero-config, fast.
- Elysia's `.handle()` method allows testing routes without starting an HTTP server.
- For database tests, use a test PostgreSQL database with drizzle-kit migrations applied in setup.
- For ClickHouse tests, use a test ClickHouse instance (or mock the client for unit tests).

### SSE Implementation: ClickHouse Polling (RECOMMENDED)
**Recommendation:** Poll ClickHouse at 2-3 second intervals for new events, emit via SSE.
**Reasoning:**
- ClickHouse does not support change data capture or event subscriptions natively.
- Polling at 2-3 second intervals is low-cost against materialized views and provides near-real-time updates.
- Alternative (event-driven via PostgreSQL LISTEN/NOTIFY from evidence collector) would require changes to the Rust evidence collector -- out of scope for Phase 5.
- The polling approach is simple, testable, and has predictable resource consumption.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js on Node.js | Elysia on Bun | 2023-2024 | 10-20x throughput improvement; native TypeScript; built-in OpenAPI |
| Prisma ORM | Drizzle ORM | 2023-2024 | No binary engine dependency; SQL-native; better migration control |
| Manual OpenAPI specs | Auto-generated from TypeBox schemas | Elysia 1.0+ (2024) | Single source of truth for types, validation, and docs |
| OPA server mode (daemon) | OPA CLI build (batch) | Stable since OPA 0.15 | Wasm compilation doesn't need a running OPA server; CLI is sufficient |
| `@clickhouse/client` Node.js only | Works in Bun | Bun 1.1.6 (April 2024) | Removed need for separate Node.js process for ClickHouse access |

**Deprecated/outdated:**
- `@elysiajs/stream` plugin: SSE is now built into Elysia core via generator functions and the `sse()` utility. The stream plugin is no longer needed.
- Elysia with Zod validation: While still supported, TypeBox is the primary/recommended validation library for Elysia, providing better performance and deeper integration.

## Open Questions

1. **OPA CLI version pinning and binary distribution**
   - What we know: `opa build -t wasm` is stable and well-documented. The CLI is a single Go binary.
   - What's unclear: Best practice for pinning OPA CLI version in the project. Whether to vendor the binary, use a version manager, or rely on system install.
   - Recommendation: Pin a specific OPA version in the Dockerfile. For local development, document the required version and provide a setup script. Verify Wasm output compatibility with the kernel's Wasmtime version.

2. **Wasm module compatibility verification**
   - What we know: The kernel uses Wasmtime with a pooling allocator, 1MB max memory per slot. OPA produces standard Wasm modules.
   - What's unclear: Whether all OPA-compiled Wasm modules are ABI-compatible with the kernel's Wasmtime configuration, or whether specific OPA build flags are needed.
   - Recommendation: Create a verification step that loads the compiled Wasm into a Wasmtime instance (or calls the kernel's validation function) after compilation. This can be deferred to Phase 6 integration but should be designed for in Phase 5.

3. **Seed Rego policy quality for regulatory frameworks**
   - What we know: Each regulatory requirement needs a working Rego policy. EU AI Act and GDPR are seeded on first deploy.
   - What's unclear: The exact mapping from regulatory requirements to Rego policy rules. This requires domain expertise in EU AI Act articles and GDPR articles.
   - Recommendation: Start with a representative subset (5-10 policies per framework) that cover the most impactful requirements. Mark them as "starter" policies in the seed metadata. Full coverage can be expanded iteratively.

4. **Cross-database enrichment caching strategy**
   - What we know: Audit trail responses need to join ClickHouse data with PostgreSQL metadata (policy names, user display names, vendor display names).
   - What's unclear: Expected cache invalidation frequency and whether a simple in-memory Map with TTL is sufficient or if a more sophisticated cache is needed.
   - Recommendation: Start with a simple LRU cache (`Map` with TTL) for PostgreSQL entities referenced in audit responses. If performance testing shows issues, upgrade to a proper caching layer.

## Sources

### Primary (HIGH confidence)
- [OPA Wasm Documentation](https://www.openpolicyagent.org/docs/latest/wasm/) - OPA build command, Wasm bundle format, entrypoint requirements
- [OPA CLI Reference](https://www.openpolicyagent.org/docs/cli) - `opa build`, `opa check` command syntax
- [Elysia Official Docs - Handler](https://elysiajs.com/essential/handler) - SSE generator pattern, response handling
- [Elysia Official Docs - Best Practice](https://elysiajs.com/essential/best-practice) - Project structure, plugin patterns, service layer
- [Elysia Official Docs - Drizzle Integration](https://elysiajs.com/integrations/drizzle) - drizzle-typebox bridge, TypeBox version pinning
- [Drizzle ORM - Bun SQL](https://orm.drizzle.team/docs/connect-bun-sql) - Bun driver setup, connection configuration
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations) - drizzle-kit commands, migration workflow
- [ClickHouse JS Docs](https://clickhouse.com/docs/integrations/javascript) - Client API, parameterized queries, streaming

### Secondary (MEDIUM confidence)
- [Elysia npm versions page](https://www.npmjs.com/package/elysia) - Confirmed Elysia 1.4.26 as latest (published 3 days ago)
- [Bun GitHub releases](https://github.com/oven-sh/bun/releases) - Confirmed Bun 1.3.9 as latest
- [Bun ClickHouse compatibility](https://github.com/oven-sh/bun/issues/5470) - `@clickhouse/client` works in Bun since v1.1.6
- [drizzle-orm npm](https://www.npmjs.com/package/drizzle-orm) - Confirmed 0.45.1 as latest stable
- [Drizzle ORM PostgreSQL Best Practices Guide 2025](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) - Connection pool configuration patterns
- [flashQ + Elysia background jobs](https://dev.to/egeominotti/flashq-elysia-honojs-background-jobs-for-modern-bun-apps-42na) - Background worker patterns for Bun

### Tertiary (LOW confidence)
- Wasm module size relative to kernel's 1MB limit: Could not find authoritative source on typical OPA Wasm output sizes. Need empirical validation. Based on general OPA knowledge, simple policy Wasm modules are typically 100-300KB, well within the 1MB limit, but complex policies with embedded data could exceed it.
- OPA `--format json` flag for `opa check`: Inferred from CLI reference but exact JSON error schema not verified against latest OPA version.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs and npm; versions confirmed current
- Architecture: MEDIUM-HIGH - Patterns from official Elysia docs and community best practices; project structure follows Elysia recommendations
- Pitfalls: MEDIUM - Identified from documentation warnings, GitHub issues, and inference from system constraints; some pitfalls (Wasm size, ClickHouse query patterns) need empirical validation
- OPA compilation pipeline: MEDIUM - CLI commands verified via official docs; integration with Bun subprocess and error parsing needs implementation validation

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (30 days -- stable ecosystem, no major breaking changes expected)
