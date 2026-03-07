# Pass 1 Bulletin - High/Critical Findings (Fixed Schema)

Date: 2026-03-06
Severity model: CVSS v4.0
Scope: `control-plane`, `dashboard`, `kernel`, `evidence-collector`, `docker/helm/ci`, diff anchor `v1.1..HEAD`

## Finding `CRIT-001`
- `id`: `CRIT-001`
- `title`: SAML role claim is directly trusted for privileged local role assignment
- `severity`: Critical
- `cvss_vector`: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H`
- `cvss_score`: `9.4`
- `file`: `control-plane/src/modules/auth/service.ts`
- `line`: `445`
- `component`: control-plane auth provisioning
- `entry_point`: `POST /api/v1/auth/saml/acs`
- `trust_boundary`: IdP assertion claims -> internal RBAC role assignment
- `cwe`: `CWE-269`, `CWE-285`
- `owasp_top10_2025`: `A01 Broken Access Control`, `A04 Insecure Design`
- `asvs_control`: `V4 Access Control`, `V2 Authentication`
- `soc2`: `CC6.1, CC6.2, CC6.6`
- `iso_42001`: `Clause 8.2 operational controls for AI system security`
- `gdpr`: `Art.32 Security of processing`
- `hipaa`: `164.312(a)(1) Access Control`
- `pci_dss`: `Req.7 Restrict access to system components and cardholder data`
- `impact`: New SSO users can be provisioned with privileged application roles based on assertion role claims.
- `reproduction_steps`:
  1. Inspect `control-plane/src/modules/auth/saml/handlers.ts:55` and `:110` for `roleHint` extraction/forwarding.
  2. Inspect `control-plane/src/modules/auth/service.ts:446` and `:454` for privileged role acceptance from `roleHint`.
- `proof`: Code path from SAML assertion -> `roleHint` -> user creation role assignment exists without server-side mapping policy.
- `recommended_fix`: Replace direct role claim trust with explicit server-managed mapping (IdP group/claim to approved role map), default-deny unknown mappings, and block privileged role assignment unless explicitly approved.
- `diff_snippet`:
```diff
- const role = roleHint && VALID_ROLES.includes(roleHint) ? roleHint : "read_only_auditor";
+ const role = await resolveMappedRoleFromIdpClaims(assertionClaims, orgPolicyMap);
+ if (!role) role = "read_only_auditor";
+ enforcePrivilegedRoleAssignmentPolicy(role, assertionIssuer, userIdentity);
```
- `risk_acceptance`: `null`

## Finding `CRIT-002`
- `id`: `CRIT-002`
- `title`: Session token is transported in URL query parameter during SAML callback handoff
- `severity`: Critical
- `cvss_vector`: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:R/VC:H/VI:H/VA:L/SC:H/SI:H/SA:L`
- `cvss_score`: `9.1`
- `file`: `control-plane/src/modules/auth/saml/handlers.ts`
- `line`: `122`
- `component`: SAML ACS redirect flow
- `entry_point`: `POST /api/v1/auth/saml/acs -> GET /api/auth/saml-callback`
- `trust_boundary`: control-plane auth bootstrap -> browser URL surface -> dashboard callback
- `cwe`: `CWE-598`, `CWE-201`
- `owasp_top10_2025`: `A02 Cryptographic Failures`, `A07 Identification and Authentication Failures`
- `asvs_control`: `V3 Session Management`, `V2 Authentication`
- `soc2`: `CC6.1, CC6.7`
- `iso_42001`: `Clause 8.2 secure operational controls`
- `gdpr`: `Art.32 Security of processing`
- `hipaa`: `164.312(e)(1) Transmission Security`
- `pci_dss`: `Req.4 Protect transmitted account data`
- `impact`: Session token can leak via browser history, logs, telemetry, and referrer chains, enabling session hijack.
- `reproduction_steps`:
  1. Inspect `control-plane/src/modules/auth/saml/handlers.ts:122` for `?token=${sessionToken}` redirect.
  2. Inspect `dashboard/src/app/api/auth/saml-callback/route.ts:16` for query token ingestion.
  3. Inspect `dashboard/src/app/api/auth/saml-callback/route.ts:27` for direct bearer use of that token.
- `proof`: Active bearer credential is moved in URL query parameters and consumed as session identity.
- `recommended_fix`: Use one-time authorization code exchange (short TTL, single use) or backchannel POST handoff; never place bearer session credentials in URL components.
- `diff_snippet`:
```diff
- const callbackUrl = `${DASHBOARD_URL}/api/auth/saml-callback?token=${sessionToken}`;
+ const oneTimeCode = await issueOneTimeCodeForSession(sessionToken, user.id);
+ const callbackUrl = `${DASHBOARD_URL}/api/auth/saml-callback?code=${oneTimeCode}`;
```
- `risk_acceptance`: `null`

## Finding `HIGH-003`
- `id`: `HIGH-003`
- `title`: Logout does not invalidate server-side sessions
- `severity`: High
- `cvss_vector`: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:H/SI:H/SA:N`
- `cvss_score`: `8.2`
- `file`: `dashboard/src/app/api/auth/logout/route.ts`
- `line`: `4`
- `component`: dashboard auth API + control-plane session validation
- `entry_point`: `POST /api/auth/logout` and subsequent `GET /api/v1/auth/me`
- `trust_boundary`: browser logout action -> server-side session lifecycle
- `cwe`: `CWE-613`
- `owasp_top10_2025`: `A07 Identification and Authentication Failures`
- `asvs_control`: `V3 Session Management`
- `soc2`: `CC6.1, CC6.2`
- `iso_42001`: `Clause 8.2 lifecycle controls for identity/session`
- `gdpr`: `Art.32 Security of processing`
- `hipaa`: `164.312(a)(2)(iii) Automatic logoff intent`
- `pci_dss`: `Req.8 Identify users and authenticate access`
- `impact`: Exfiltrated tokens remain valid after logout and can be replayed until expiration.
- `reproduction_steps`:
  1. Insert test session token in Postgres for test user.
  2. `GET /api/v1/auth/me` with bearer token returns `200`.
  3. `POST /api/auth/logout` returns `200` and clears cookie.
  4. `GET /api/v1/auth/me` with same bearer token still returns `200`.
- `proof`: Runtime capture in `security-review/RUNTIME_VALIDATION.md` confirms server-side session remained valid after logout.
- `recommended_fix`: Add server-side session revocation endpoint and invoke it during logout; revoke sessions on role change/password reset/admin lock events.
- `diff_snippet`:
```diff
// dashboard logout route
+ await fetch(`${CONTROL_PLANE_URL}/api/v1/auth/logout`, {
+   method: "POST",
+   headers: { Authorization: `Bearer ${token}` },
+ });

// control-plane auth service
+ async revokeSession(token: string): Promise<void> {
+   await db.delete(sessions).where(eq(sessions.token, token));
+ }
```
- `risk_acceptance`: `null`

## Finding `HIGH-004`
- `id`: `HIGH-004`
- `title`: Policy distribution snapshot ignores org/dept/team scope and trusts client-supplied scope context
- `severity`: High
- `cvss_vector`: `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H`
- `cvss_score`: `8.7`
- `file`: `control-plane/src/modules/distribution/server.ts`
- `line`: `61`
- `component`: gRPC distribution service
- `entry_point`: `PolicyDistribution.Subscribe`
- `trust_boundary`: kernel client claims -> server-side policy materialization
- `cwe`: `CWE-862`, `CWE-639`
- `owasp_top10_2025`: `A01 Broken Access Control`, `A04 Insecure Design`
- `asvs_control`: `V4 Access Control`, `V1 Architecture`
- `soc2`: `CC6.1, CC6.6`
- `iso_42001`: `Clause 8.2 access control and segregation`
- `gdpr`: `Art.32 Security of processing (segregation)`
- `hipaa`: `164.312(a)(1) Access Control`
- `pci_dss`: `Req.7 Access restriction`
- `impact`: Authenticated clients may receive policy material outside intended tenant/department/team scope.
- `reproduction_steps`:
  1. Inspect `buildFullSnapshot(db, _orgId, _deptId, _teamId)` args in `server.ts:61` to `:66`.
  2. Inspect policy query `server.ts:75` to `:100`, which does not filter by org/dept/team.
  3. Inspect request-scoped identifiers read from client payload `server.ts:163` to `:168`.
- `proof`: Scope values are accepted from request and tracker, but snapshot query is global and unscoped.
- `recommended_fix`: Bind kernel identity to mTLS certificate identity and server-side registry; enforce org/dept/team filters during snapshot generation and acknowledgment processing.
- `diff_snippet`:
```diff
- const activePolicies = await db.select(...).from(policies)...where(and(eq(policies.isActive, true), ...));
+ const activePolicies = await db.select(...).from(policies)...where(and(
+   eq(policies.isActive, true),
+   eq(policies.orgId, resolvedKernelScope.orgId),
+   inArray(policies.departmentId, resolvedKernelScope.departmentIds)
+ ));
```
- `risk_acceptance`: `null`

## Finding `HIGH-011`
- `id`: `HIGH-011`
- `title`: Audit aggregate stats endpoints return unscoped cross-department data
- `severity`: High
- `cvss_vector`: `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:H/SI:N/SA:N`
- `cvss_score`: `8.0`
- `file`: `control-plane/src/modules/audit/index.ts`
- `line`: `158`
- `component`: audit analytics endpoints
- `entry_point`: `GET /api/v1/audit/stats/violations` and `GET /api/v1/audit/stats/vendor-usage`
- `trust_boundary`: authenticated department-scoped user -> global aggregate analytics
- `cwe`: `CWE-200`, `CWE-862`
- `owasp_top10_2025`: `A01 Broken Access Control`
- `asvs_control`: `V4 Access Control`
- `soc2`: `CC6.1, CC6.6`
- `iso_42001`: `Clause 8.2 access segregation and least-privilege controls`
- `gdpr`: `Art.32 Security of processing (data minimization and segregation)`
- `hipaa`: `164.312(a)(1) Access Control`
- `pci_dss`: `Req.7 Restrict access by business need-to-know`
- `impact`: Department-scoped users can retrieve tenant-wide aggregate telemetry that may reveal other departments' activity patterns.
- `reproduction_steps`:
  1. Inspect `control-plane/src/modules/audit/index.ts:158` and `:177`; handlers call service methods without passing `ctx.user.departmentIds`.
  2. Inspect `control-plane/src/modules/audit/service.ts:110` and `:117`; methods query ClickHouse without department scope filtering.
  3. Observe module comments note this scope gap is deferred, confirming the current behavior.
- `proof`: Role checks exist, but object/tenant scope is not enforced on the two aggregate statistics routes.
- `recommended_fix`: Apply department scope to aggregate queries by propagating `ctx.user.departmentIds` into service/query layers and enforcing scoped `WHERE` clauses.
- `diff_snippet`:
```diff
- const data = await ctx.auditService.getHourlyViolations(ctx.query.from, ctx.query.to);
+ const data = await ctx.auditService.getHourlyViolations(ctx.query.from, ctx.query.to, ctx.user.departmentIds);

- return queryHourlyViolations(this.clickhouse, from, to);
+ return queryHourlyViolations(this.clickhouse, from, to, departmentIds);
```
- `risk_acceptance`: `null`

## Rapid Remediation Order
1. `CRIT-001` remove direct claim-to-role trust in SAML provisioning.
2. `CRIT-002` eliminate token-in-query callback handoff.
3. `HIGH-003` implement server-side session revocation.
4. `HIGH-004` enforce certificate-bound tenant/scope filtering in gRPC distribution.
5. `HIGH-011` enforce department scoping on aggregate audit stats endpoints.
