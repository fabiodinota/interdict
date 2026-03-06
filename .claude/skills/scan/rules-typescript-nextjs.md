<overview>
TypeScript, Next.js 16, and React 19 rules. Apply to all .ts, .tsx, .mts, .cts files. Layer on top of core rules.
</overview>

<section name="type-safety">
<rule id="no-any" name="No any Type">
Pet peeve #2 -- always at least Medium.
- any in type annotations -> Medium
- any in API route handlers, auth code, or security-related code -> High
- as any type assertions -> Medium
- Generic &lt;any&gt; type arguments -> Medium
- @ts-ignore without a specific error description -> Medium (use @ts-expect-error with explanation instead)

Acceptable alternatives: unknown with type narrowing, specific union types, generics, Record&lt;string, unknown&gt;.
</rule>

<rule id="strict-typescript" name="Strict TypeScript">
- Missing strict: true in tsconfig.json -> Medium
- Non-null assertions (!) used more than once per function -> Low ("add proper null checks")
- Optional chaining overuse (4+ levels: a?.b?.c?.d?.e) -> Low ("restructure data access")
- Type assertions (as X) where a type guard would be safer -> Low
</rule>

<rule id="import-hygiene" name="Import Hygiene">
- import type not used for type-only imports -> Low ("use import type for types")
- Wildcard imports (import * as X) -> Medium ("import only what you need for tree-shaking")
- Unused imports -> Low
- Importing from node_modules deep paths (e.g., import X from 'package/dist/internal/thing') -> Medium ("use public API only")
</rule>
</section>

<section name="nextjs-app-router">
<rule id="server-client-components" name="Server vs Client Components">
- "use client" on a component that doesn't use client-side hooks or browser APIs -> Low ("remove unnecessary client directive")
- Client hooks (useState, useEffect, useRef, useReducer, useCallback, useMemo) used without "use client" -> High ("will fail at runtime")
- Large "use client" components that could be split (>100 lines) -> Low ("extract server-renderable parts")
- Passing non-serializable props (functions, class instances) from Server to Client Components -> High ("server/client boundary violation")
</rule>

<rule id="server-actions" name="Server Actions">
- "use server" functions that don't validate input -> High ("server actions are public endpoints")
- Server actions without auth checks -> High (Interdict auth rule)
- Server actions that return sensitive data without filtering -> Medium
- Large server actions (>30 lines) -> Low ("extract to service layer")
</rule>

<rule id="data-fetching" name="Data Fetching">
- fetch() in Client Components for data that should be server-fetched -> Medium ("move to Server Component or server action")
- Missing revalidate or cache configuration on fetch calls -> Low
- fetch() without error handling -> Medium
- Waterfall fetches (sequential awaits where parallel is possible) -> Low ("use Promise.all")
</rule>

<rule id="route-handlers" name="Route Handlers (app/api/**/route.ts)">
- Missing auth check (requireAuth()) on non-health routes -> High (pet peeve #4)
- any type on request body or response -> Medium (pet peeve #2)
- Missing input validation (no zod/schema validation on request body) -> Medium
- Returning raw objects without a typed response shape -> Low
- Missing error handling (no try/catch or error boundary) -> Medium
- Route handler >50 lines -> Low ("extract to service")
</rule>

<rule id="metadata" name="Metadata and SEO">
- Pages missing metadata export or generateMetadata -> Low
- Hardcoded strings that should use the metadata API -> Low
</rule>
</section>

<section name="react-19">
<rule id="deprecated-patterns" name="Deprecated Patterns">
- React.forwardRef -> Medium ("deprecated in React 19 -- pass ref as a regular prop")
- Class components (extends Component / extends PureComponent) -> Medium ("convert to function component")
- defaultProps on function components -> Low ("use default parameter values")
- propTypes -> Low ("use TypeScript types instead")
- Legacy context API (contextType, getChildContext) -> Medium
</rule>

<rule id="hooks" name="Hooks">
- useEffect for data fetching (should use server-side data fetching or a data library) -> Low ("consider RSC or server action")
- useEffect with missing dependency array items -> High ("stale closure bug")
- useEffect with object/array in dependency array (will re-run every render) -> Medium ("memoize or restructure")
- useMemo / useCallback wrapping cheap computations -> Low ("unnecessary memoization")
- Custom hooks that don't start with use -> Medium ("hooks must start with 'use'")
- Hooks called conditionally or inside loops -> High ("violates rules of hooks")
</rule>

<rule id="component-patterns" name="Component Patterns">
- Components >200 lines -> Medium ("split into smaller components")
- Props drilling through 3+ levels -> Low ("consider context or composition")
- Inline function definitions in JSX that cause unnecessary re-renders -> Low
- Missing key prop in .map() rendering -> High ("React reconciliation will break")
- Index as key in lists that can reorder -> Medium
</rule>

<rule id="react-19-features" name="React 19 New Features">
- Using use() hook for promises/context (preferred over useContext in React 19) -> Info (positive highlight when used correctly)
- useFormStatus, useFormState, useOptimistic for form handling -> Info (positive highlight)
- ref as a regular prop (no forwardRef needed) -> Info (positive highlight)
</rule>
</section>

<section name="security">
<rule id="xss-prevention" name="XSS Prevention">
- dangerouslySetInnerHTML -> High unless content is sanitized with DOMPurify or equivalent
- String interpolation in href attributes (potential javascript: injection) -> High
- Rendering user input without escaping in non-JSX contexts -> High
</rule>

<rule id="api-security" name="API Security">
- API routes without CSRF protection -> Medium
- Cookies without httpOnly, secure, sameSite attributes -> Medium
- Exposing internal error details in API responses -> Medium
- Missing rate limiting on API routes -> Medium (Interdict rule for audit/enforcement routes)
</rule>

<rule id="injection" name="Injection">
- Template literal SQL queries (query(`SELECT * FROM x WHERE id = ${id}`)) -> High ("SQL injection -- use parameterized queries")
- Dynamic import() with user-controlled paths -> High
- eval(), Function() constructor, new Function() -> High
</rule>
</section>

<section name="dashboard-rules">
<rule id="dashboard-boundary" name="Dashboard Boundary">
Pet peeve #9.
- Dashboard code that transforms, formats, or modifies prompts before sending to backend -> Medium ("dashboard is pure UI -- prompt processing belongs in orchestrator")
- Dashboard importing from kernel or control-plane packages -> High (Interdict boundary rule)
- Dashboard calling control-plane directly outside /api/proxy/ -> High (Interdict boundary rule)
</rule>

<rule id="ui-patterns" name="UI Patterns">
- Inline styles for layout (should use Tailwind or CSS modules) -> Low
- Hard-coded color values instead of design tokens -> Low
- Missing loading/error states in data-fetching components -> Medium
- Missing Suspense boundaries around async components -> Low
</rule>
</section>

<section name="code-structure">
<rule id="file-organization" name="File Organization">
- Component file >200 lines -> Medium ("split into subcomponents")
- Utility file >300 lines -> Medium ("split by concern")
- Barrel exports (index.ts) that re-export everything without curation -> Low
- Mixing component definition and data fetching in the same file when either is complex -> Low
</rule>

<rule id="naming" name="Naming">
- Component files not matching the component name -> Low
- Non-component .tsx files (should be .ts if no JSX) -> Low
- Event handlers not prefixed with handle or on -> Low
</rule>
</section>

<section name="testing">
<rule id="ts-testing" name="Testing">
- Components without any test coverage -> Low (informational)
- Tests that rely on implementation details (internal state, private methods) -> Medium
- Missing error boundary tests -> Low
- E2E tests making real API calls without mocking -> Medium
</rule>
</section>

<section name="performance">
<rule id="ts-performance" name="Performance">
- Large client bundles (importing heavy libraries in Client Components) -> Low
- Images without next/image optimization -> Low
- Missing loading.tsx for route segments -> Low
- Unnecessary client-side state for data that could be server-rendered -> Medium
- Re-renders caused by context changes (entire subtree re-renders) -> Low ("split context or use selectors")
</rule>
</section>
