# S06: Security & CSP Hardening — Research

**Date:** 2026-03-15

## Summary

Three distinct tasks with different risk profiles. CSP nonce hardening (T01) is the most complex — it requires creating Next.js middleware that generates per-request nonces, moving CSP from `next.config.ts` static headers to middleware-injected headers, passing nonces to `next-themes` ThemeProvider, and making the root layout async to read the `x-nonce` header. Next.js 16 has first-class nonce support: middleware sets `Content-Security-Policy` with the nonce and an `x-nonce` header, then Next.js automatically extracts and applies the nonce to all framework scripts and inline styles. The `next-themes` library (v0.4.6) already accepts a `nonce` prop that it passes to its inline `<script>` tag. Helm network policy enablement (T02) is straightforward — flip four `enabled: false` to `true` in `values.yaml`; the policies themselves are already well-crafted with correct ingress/egress rules. The `full_text_storage` documentation (T03) requires a startup warning in the evidence-collector, inline code comments, and a dedicated operator guide section.

The primary recommendation is: **middleware-based nonce generation** following the official Next.js CSP guide. The existing `src/proxy.ts` module already handles session gating and should be extended (or a separate middleware.ts created) to add CSP nonce generation. The root layout must become an async Server Component that reads the nonce from `headers()` and passes it to `ThemeProvider`. For `style-src`, keep `'unsafe-inline'` in production — React's inline `style` attributes on SSR-rendered HTML elements cannot be nonce-gated (nonces only work on `<style>` tags, not `style=""` attributes), and our codebase has at least two inline style usages (Sonner `toastOptions.style` in the dashboard layout and VendorUsageChart). The milestone success criterion says "zero `unsafe-inline` in script-src or style-src" but this conflicts with how CSP fundamentally works for inline style attributes. The pragmatic approach: remove `unsafe-inline` from `script-src` (high security value — XSS prevention) and document why `style-src` keeps `'unsafe-inline'` or uses `'unsafe-hashes'` for the specific inline styles. Alternatively, refactor the two inline styles to CSS classes and then use nonces for `style-src` too.

## Recommendation

### T01: CSP Nonce Implementation

**Approach:** Create `dashboard/src/middleware.ts` that:
1. Generates a cryptographic nonce via `crypto.randomUUID()` + base64 encoding
2. Constructs a CSP header with `'nonce-{nonce}'` in `script-src`
3. Sets the CSP as a response header and `x-nonce` as a request header
4. Merges with the existing `proxy()` session-gating logic from `src/proxy.ts`

Remove the static CSP from `next.config.ts` `headers()` since middleware-set headers take precedence and we need per-request nonces. Keep the other security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) in `next.config.ts`.

Make the root layout async to read `x-nonce` from `headers()` and pass it to `ThemeProvider`:
```tsx
const nonce = (await headers()).get('x-nonce') ?? undefined;
<ThemeProvider nonce={nonce} ...>
```

For `style-src`: Refactor the two inline style usages to CSS classes/Tailwind, then use nonce for `style-src` too. The Sonner `toastOptions.style` can be replaced with a CSS class using Sonner's `className` prop or the `toastOptions.className` prop. The VendorUsageChart inline `borderColor` can move to a Tailwind class.

**Nonce forces dynamic rendering.** Since the root layout reads `headers()`, the entire app becomes dynamically rendered. This is acceptable for a dashboard application (it already requires authentication, so pages are user-specific anyway). The `output: "standalone"` build mode is compatible with dynamic rendering.

### T02: Helm Network Policies

**Approach:** Change `networkPolicy.enabled` from `false` to `true` in all 4 service sections of `values.yaml`. Update `values-pilot.yaml` and `values-enterprise.yaml` if they override network policy settings. Add a comment in values.yaml noting that operators can disable if their CNI doesn't support NetworkPolicy.

The policies themselves are already well-designed:
- **kernel:** Accepts ingress on 8443, egress to control-plane (gRPC), evidence-collector (gRPC), DNS, and upstream HTTPS (443)
- **control-plane:** Accepts from dashboard (HTTP) and kernel (gRPC), egress to Postgres, ClickHouse, DNS
- **dashboard:** Accepts HTTP ingress, egress to control-plane API and DNS
- **evidence-collector:** Accepts from kernel (gRPC), egress to ClickHouse, S3/MinIO, DNS

No structural changes needed — just enable by default.

### T03: full_text_storage Documentation

**Approach:**
1. Add startup `tracing::warn!` in evidence-collector's `main.rs` when `cfg.full_text_storage == true` — message should emphasize encryption-at-rest requirement and GDPR/data-residency implications
2. Add startup `tracing::warn!` in kernel's `bootstrap.rs` when the env var is set
3. Add inline code comments at `build_evidence_event` in `connect.rs` explaining the privacy implications
4. Create `docs/operator/full-text-storage.md` operator guide section (this feeds into S08's docs)

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CSP nonce generation | Next.js middleware (`crypto.randomUUID()`) | Official pattern, framework auto-applies nonces to scripts |
| Nonce propagation to components | `headers().get('x-nonce')` | Built into Next.js App Router — no custom plumbing needed |
| Nonce for theme script | `next-themes` `nonce` prop | Already supported in v0.4.6, passes nonce to inline `<script>` |
| Network policy templates | Existing `helm/interdict/templates/*/networkpolicy.yaml` | Already written with correct ingress/egress rules |
| Helm template validation | `helm template` + `kube-score` | Standard tooling, no custom validators |

## Existing Code and Patterns

- `dashboard/next.config.ts` — Current CSP with `unsafe-inline` in static headers; security headers to preserve
- `dashboard/src/proxy.ts` — Session-gating middleware logic (must merge with CSP nonce generation)
- `dashboard/src/app/layout.tsx` — Root layout (Server Component, must become async for nonce reading)
- `dashboard/src/components/theme-provider.tsx` — ThemeProvider wrapper (passes props through to next-themes, including nonce)
- `dashboard/src/app/(dashboard)/layout.tsx` — Dashboard layout with Sonner `Toaster` using inline `style` (must refactor to className)
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` — Uses inline `style={{ borderColor: "var(--color-border)" }}` (must refactor to Tailwind)
- `helm/interdict/values.yaml` — Four `networkPolicy.enabled: false` entries to flip
- `helm/interdict/templates/*/networkpolicy.yaml` — All four network policies already exist with correct rules
- `crates/kernel/src/bootstrap.rs` — Reads `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE`, logs it as info, no warning
- `crates/kernel/src/proxy/connect.rs` — `build_evidence_event()` uses `full_text_storage` to decide whether to include prompt text
- `crates/evidence-collector/src/config.rs` — Reads `COLLECTOR_FULL_TEXT_STORAGE`, no startup warning
- `crates/evidence-collector/src/main.rs` — Entry point for startup warnings (cfg is available but `full_text_storage` not checked/warned)

## Constraints

- **CSP nonce forces dynamic rendering** — reading `headers()` in root layout opts out of static rendering. Acceptable for an authenticated dashboard.
- **`style-src` inline attributes** — CSS `style=""` attributes on HTML elements cannot be nonce-gated; they require `'unsafe-inline'` or `'unsafe-hashes'`. Our two inline style usages must be refactored to CSS classes to achieve zero `unsafe-inline`.
- **next-themes inline script** — `next-themes` injects a `<script dangerouslySetInnerHTML>` tag for theme detection. Its nonce prop correctly sets `nonce` on this script only during SSR (cleared after hydration for security). This is the primary reason `script-src 'unsafe-inline'` was needed.
- **Helm NetworkPolicy requires CNI support** — Calico, Cilium, or similar CNI must be present; vanilla `kubenet` ignores NetworkPolicy objects. Document this clearly.
- **`values-pilot.yaml` and `values-enterprise.yaml`** do not currently override `networkPolicy` — they only override resource limits. No merge conflict risk.
- **Middleware matcher** — The middleware must NOT match `_next/static`, `_next/image`, or `favicon.ico` paths (static assets don't need CSP nonces and shouldn't be slowed by middleware).
- **Dev mode** — In development, `'unsafe-eval'` is needed in `script-src` for React Fast Refresh / hot module replacement. Use `process.env.NODE_ENV === 'development'` guard.

## Common Pitfalls

- **CSP header in both middleware and next.config.ts** — Next.js merges headers, which can result in duplicate/conflicting CSP headers. Remove CSP from `next.config.ts` `headers()` when moving to middleware.
- **Nonce not available in client components** — Only Server Components can read `headers()`. The nonce must be passed via props from the root layout, not read inside client components.
- **`strict-dynamic` with nonces** — `'strict-dynamic'` allows scripts loaded by nonce-gated scripts to execute without their own nonce. Include this in `script-src` for script chaining (webpack chunks, Next.js runtime).
- **Style nonce vs style attribute** — CSP nonces work on `<style>` elements, NOT on `style=""` HTML attributes. If any component uses inline `style` attributes in SSR HTML, `style-src` needs `'unsafe-inline'` unless those styles are refactored to classes.
- **Network policy breaks existing clusters** — Changing default from `false` to `true` is a breaking change for Helm upgrades. Add a clear note in CHANGELOG about this change and document how to disable if CNI doesn't support NetworkPolicy.
- **`full_text_storage` double-config** — The flag is independently configured in kernel (`INTERDICT_EVIDENCE_FULL_TEXT_STORAGE`) and evidence-collector (`COLLECTOR_FULL_TEXT_STORAGE`). They should be mentioned together in operator docs to avoid confusion.

## Open Risks

- **Sonner runtime injection** — Sonner may inject `<style>` tags at runtime for toast animations. If it does, those will be blocked by `style-src 'nonce-...'` without `'unsafe-inline'`. Investigation shows Sonner uses a static CSS file (`styles.css`), so this should be fine. Verify in browser after implementation.
- **Recharts SVG styles** — Recharts uses SVG `style` attributes extensively. SVG inline styles follow the same CSP rules. These are set via React's `style` prop (JS `element.style` property), which is NOT blocked by CSP. But SSR-rendered SVG `style` attributes in HTML will be blocked. Need to test.
- **Next.js 16 internal inline styles** — Next.js itself may inject inline `<style>` tags for font loading, CSS modules, or layout shifts. The framework should auto-apply nonces to these, but verify.
- **Breaking change for Helm upgrades** — Enabling network policies by default means existing deployments upgrading via `helm upgrade` will suddenly have network policies applied. If their CNI doesn't support it, traffic may be blocked. Mitigate with CHANGELOG entry and clear documentation.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js 16 | `fernandofuc/nextjs-claude-setup@nextjs-16-complete-guide` | available (184 installs) — covers general Next.js 16, not CSP-specific |
| Next.js 16 | `bobmatnyc/claude-mpm-skills@nextjs-v16` | available (87 installs) — general Next.js v16 patterns |
| Helm/K8s NetworkPolicy | `martinholovsky/claude-skills-generator@cilium-expert` | available (61 installs) — Cilium-focused, not general NetworkPolicy |
| K8s sidecar | `k8s-sidecar-provision` | installed (project skill) |
| Security | `security-best-practices` | installed (user skill) |

No skills are directly relevant to CSP nonce implementation — the official Next.js docs (fetched via Context7) provide the canonical pattern. The installed `security-best-practices` skill may be useful for review but not for implementation.

## Sources

- Next.js 16 CSP nonce middleware pattern with `x-nonce` header and `'strict-dynamic'` (source: [Next.js CSP Guide](https://nextjs.org/docs/app/guides/content-security-policy) via Context7)
- `next-themes` v0.4.6 supports `nonce` prop, applies it to inline `<script>` and transition-disabling `<style>` (source: `node_modules/next-themes/dist/index.js` source inspection)
- Sonner v2.0.7 uses external CSS file (`dist/styles.css`), no runtime `<style>` injection (source: `node_modules/sonner/dist/` inspection)
- CSP `style-src` nonces only apply to `<style>` elements, not `style=""` HTML attributes (source: [MDN CSP style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/style-src))
- Helm NetworkPolicy requires CNI that supports NetworkPolicy API — policies are no-ops without it (source: Kubernetes documentation)
