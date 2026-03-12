# Runtime Validation Evidence

Date: 2026-03-06
Environment: Docker Compose (`postgres`, `clickhouse`, `cert-init`, `control-plane`, `dashboard`, `kernel`, `evidence-collector`)

## Service Bring-up
Command:
```powershell
docker compose up -d postgres clickhouse cert-init control-plane dashboard
```

Observed:
- `postgres`, `clickhouse`, `control-plane`, `dashboard` healthy.
- `cert-init` completed successfully.

## Scenario Coverage Matrix

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Unauthorized/forged credential checks on protected HTTP routes | PASS | `/api/v1/auth/me` without token => `401`; forged token => `401`; `/api/proxy/policies` without cookie => `401`. |
| 2 | Session lifecycle (expiry/logout/role-change/fixation) | FAIL/PARTIAL | Logout invalidation failed (`HIGH-003`): bearer token remained valid after logout. Expiry and role-change invalidation were not fully executed in runtime. |
| 3 | Tenant/department boundary tests (IDOR/horizontal escalation) | PARTIAL | Unauthenticated access denied; code review identified unscoped aggregate audit stats routes (`HIGH-011`). Full seeded multi-tenant runtime test not completed. |
| 4 | SAML abuse tests (replay/misuse/callback/assertion validation) | PARTIAL/BLOCKED | `GET /api/v1/auth/saml/sso` returned `500` with missing metadata path handling; full replay/forgery tests blocked without IdP fixture. |
| 5 | CSRF-style state-change attempts on dashboard BFF/API routes | PARTIAL | `POST /api/auth/logout` accepted cross-origin headers when cookie is present; no explicit Origin/CSRF token validation in route. |
| 6 | Proxy abuse tests (path manipulation/upstream target traversal) | PASS/PARTIAL | Encoded traversal attempts (`/api/proxy/%2e%2e/%2e%2e/health`) returned `404`; external-target style path (`/api/proxy/http://example.com`) redirected/normalized, not proxied externally. |
| 7 | Injection tests on API filters/inputs/report/query paths | PARTIAL | Malicious date/input payloads did not execute as SQL; resulted in parser/validation errors, but surfaced as generic `500` due error mapping behavior (`LOW-010`). |
| 8 | gRPC policy/evidence channel tests under mTLS posture with missing certs | PASS | TLS handshakes from kernel container without client cert ended with `fatal certificate_required` for both control-plane `:50052` and evidence-collector `:50051`. |
| 9 | Evidence integrity mismatch handling | PARTIAL | Static review confirms collector recomputes chain/signature server-side; full crafted mismatch replay test was not executed end-to-end. |
| 10 | Container/K8s security checks (privilege/secrets/network/default creds) | FAIL/PARTIAL | Live inspect shows control-plane and dashboard run as root with writable rootfs (`MED-012`); default creds risk in templates (`MED-007`). |
| 11 | CI/CD security checks (scan coverage, artifact signing, branch protection) | PARTIAL | Workflow includes Rust gates, `cargo audit`, Trivy scan; no artifact signing/provenance checks (`LOW-013`). Branch protection is external GitHub org/repo setting and not verifiable from local files. |

## Key Runtime Captures

### Unauthorized access
```text
GET /api/v1/auth/me (no Authorization) -> 401 Unauthorized
GET /api/v1/auth/me (forged bearer)    -> 401 Unauthorized
GET /api/proxy/policies (no cookie)    -> 401 Unauthorized
```

### Session invalidation failure (`HIGH-003`)
```text
GET /api/v1/auth/me (valid bearer) -> 200 OK
POST /api/auth/logout              -> 200 OK (cookie cleared)
GET /api/v1/auth/me (same bearer)  -> 200 OK
```
Result: server-side session remained valid after logout.

### Dashboard security headers baseline
```text
GET /login response headers include: X-Powered-By: Next.js
No CSP/HSTS/X-Content-Type-Options/Permissions-Policy observed in local direct response.
```

### gRPC mTLS enforcement check
Command shape (inside `kernel` container):
```sh
openssl s_client -connect control-plane:50052 -tls1_3 -state -msg </dev/null
openssl s_client -connect evidence-collector:50051 -tls1_3 -state -msg </dev/null
```
Observed terminal alerts:
```text
Alert [fatal] certificate_required (SSL alert number 116)
```

### Input/injection abuse probes
```text
GET /api/proxy/evidence/bundles?page_size=999999                -> 500 (validation path mis-mapped)
GET /api/proxy/evidence/bundles?from_date=' OR 1=1--&to_date=... -> 500 (date parse error, not query execution)
POST /api/proxy/reports/generate with format="pdf;DROP..."      -> 500 (parse/validation handling)
```

## Cleanup
- Temporary seeded runtime records were removed from Postgres after tests:
  - `proxy-test@example.com` user and associated session token.
  - prior session-validation test rows.
