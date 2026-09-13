# P0–P12 Control Plane Hardening · Two-Round Review

Date: 2026-09-13
Branch: `fix/p0-p12-control-plane-hardening`
Base: `e959b5fd6be4306c3359bd1dd5749ad49585d9a1`
Scope: static review and hardening only. No `typecheck`, tests, build, DB connection, external infrastructure, or production approval was executed.

## 1. Objective

This hardening pass addresses the issues identified by `P0_P12_Full_Static_Audit_Two_Rounds.md` without advancing to a new product phase. The target remains a deterministic/mock Control Plane implementation. Production readiness is explicitly out of scope until real authentication, project authorization, adapters, corpus, telemetry, staging infrastructure, and command-level verification are connected.

## 2. Findings remediated

### 2.1 WebSocket Control Plane trust boundary — remediated

`/ws` now has an explicit control-plane security boundary before a pi child process is spawned:

- trusted Origin validation;
- Principal resolution;
- `coding.chat` or `coding.admin` permission;
- authenticated session-key upgrade rate limiting;
- authenticated message rate limiting;
- control-plane payload limit;
- fail-closed behavior if authenticated connection context is missing;
- `?continue=1` is ignored in control-plane mode, preventing reuse of a shared most-recent Coding Agent session across users;
- local mode preserves the original localhost Coding Chat behavior.

Control-plane model config remains read-only and secret-redacted.

### 2.2 Industry Workspace RBAC — remediated

Conversation / UIAction routes now require an explicit workspace capability. The preferred permissions are:

- `industry.workspace`; or
- `industry.workspace.admin`.

`industry.read` remains temporarily accepted as a compatibility permission for the existing deterministic fixtures/tests, but this compatibility is implemented only at the route authorization check. It is not injected into or persisted as a Trusted Principal permission.

Project authorization remains a separate server-derived boundary.

### 2.3 CSRF / Origin / Rate Limit — remediated for mock Control Plane

All `/api/industry/v1/*` requests continue to require the configured Origin policy when Origin is present. State-changing browser requests additionally reject cross-site fetches. Authenticated HTTP traffic is bounded per trusted tenant/user/session key with separate read/write buckets.

The in-memory limiter is intentionally a mock/single-process implementation; production deployment requires a shared/distributed limiter.

### 2.4 Clickjacking protection — added

Static/SPА responses now include:

- `X-Frame-Options: DENY`;
- `Content-Security-Policy: frame-ancestors 'none'`.

This protects trusted confirmation surfaces such as Mutation confirmation from being embedded by another site.

### 2.5 Authentication error mapping — hardened

PrincipalProvider failures are mapped to `401 AUTHENTICATION_REQUIRED` with `reauth` resolution rather than being reported as generic internal errors.

The current provider is still `MockPrincipalProvider`; this change prepares the HTTP contract for a real provider without pretending real authentication exists today.

### 2.6 Knowledge blind-write permissions — remediated

Knowledge writes now require combined read/write authority:

- Upload: `knowledge.read + knowledge.upload`; or `knowledge.admin`.
- Reingest: `knowledge.read + knowledge.reingest`; or `knowledge.admin`.

This prevents principals with only a write permission from guessing resource IDs or performing blind state changes. Existing server-side project/company/ACL validation remains in force.

### 2.7 Secret redaction — hardened

The common redactor now handles both sensitive keys and sensitive values, including:

- Authorization/Bearer values;
- OpenAI-style `sk-*` credentials;
- URL userinfo (`scheme://user:password@host`);
- inline `apiKey/password/passwd/token/authorization/cookie` assignments.

Model Config control-plane responses still remove the `apiKey` field and expose only configuration presence.

### 2.8 Project-selection session cache — bounded

The in-memory project-selection cache now has:

- idle TTL;
- maximum entry count;
- LRU-like pruning by last access;
- tenant + user + session composite keying.

This remains a local/mock cache. A real multi-instance deployment must use the actual authenticated session store.

### 2.9 P11 Release Gate provenance — remediated

The deterministic P11 adapter no longer labels its release gate as real `PI` output. Mock runs now use:

`source = MOCK_PI`

This provenance is intrinsic to the base P11 mock adapter and does not depend on an optional hardening module import. The shared contract allows `PI | MOCK_PI`, and the UI labels the gate accordingly.

The gate status itself remains immutable from the browser; Waiver remains a separate record and cannot turn FAIL into PASS or make an ineligible run a baseline.

## 3. Review Round 1 — implementation / regression review

Round 1 checked the hardening diff for:

- trusted-context propagation;
- route authorization consistency;
- CSRF ordering relative to Principal resolution;
- rate-limit keys and bounded state;
- WebSocket spawn-before-auth risk;
- Workspace compatibility behavior;
- Knowledge combined permissions;
- P11 provenance consistency across list/start/detail/decision;
- Secret masking;
- project-selection TTL and capacity;
- static trusted-UI anti-framing headers.

Additional issue found and fixed during this round:

- control-plane `?continue=1` could otherwise resume the shared most-recent Coding Agent session. It is now local-mode only.

Round 1 conclusion: no remaining code-level HIGH blocker was identified in the hardening diff.

## 4. Review Round 2 — attacker-path / bypass review

Round 2 treated HTTP and WebSocket as separate attack surfaces and reviewed combinations of:

- cross-site browser requests;
- authenticated-but-underprivileged principals;
- guessed IDs / blind writes;
- WebSocket upgrade/message flooding;
- oversized WebSocket frames;
- lost authenticated upgrade context;
- clickjacking of trusted confirmation UI;
- stale/shared Coding Agent sessions;
- Mock-vs-real Release Gate provenance;
- secret-bearing values in otherwise non-sensitive fields;
- mutation permission through Trusted Context;
- Waiver / Golden / Baseline bypasses.

Additional issues found and fixed during this round:

1. Authenticated WebSocket messages previously had no rate limit after successful upgrade. A message limiter now closes the connection with policy violation on excess.
2. WebSocket control-plane frames now have a bounded payload size.
3. Connection setup now fails closed before spawning pi if authenticated upgrade context is unavailable.
4. Authentication-provider failures now return 401 instead of 500.
5. Trusted UI pages now reject framing to mitigate clickjacking.
6. P11 mock provenance was moved into the base adapter itself rather than relying only on an import-time wrapper.

Round 2 conclusion: no new code-level HIGH blocker was found after these fixes.

## 5. Regression coverage added or updated

Static test code now covers, among other things:

- control-plane WebSocket trusted/untrusted origins;
- missing Coding permission;
- model-config write disablement;
- no shared-session `continue` in control-plane;
- WebSocket authenticated message rate limit;
- CSRF rejection for cross-site state-changing browser requests;
- HTTP per-session rate limits;
- Workspace RBAC denial;
- authentication failure → 401;
- Knowledge upload and reingest blind-write denial;
- project-selection expiration;
- string-level secret redaction;
- anti-framing response headers;
- P11 `MOCK_PI` provenance.

These tests were authored/reviewed but **not executed** in this pass.

## 6. Boundaries intentionally not claimed as complete

The following remain production blockers / integration prerequisites rather than defects to hide with mock code:

1. **Real authentication/session**: current control-plane bootstrap still uses `MockPrincipalProvider`; production requires OIDC/SSO or a trusted upstream session with Secure/HttpOnly/SameSite semantics.
2. **Real project membership / RBAC source**: mock authorized projects are fixtures; production must resolve per-user/per-role project memberships from an authoritative source.
3. **Distributed rate limiting**: current limiter is process-local and is not suitable as a multi-instance global quota.
4. **Real PI ownership**: Mutation/RAG/Sandbox/Report/Release Gate production policy remains owned by pi. Mock implementations are not production policy engines.
5. **Real P11 corpus**: the repository still does not contain the actual labeled 1030-case payload; only the reviewed manifest/coverage contract and deterministic fixtures exist.
6. **Real Online telemetry**: P12 metrics remain `MOCK_FIXTURE`.
7. **Staging infrastructure / E2E / CI**: not connected or executed.
8. **DB / production approval**: still not authorized and no real DDL/DML/commit was executed.

## 7. Command-level verification status

Per user instruction, this pass did not execute commands. Therefore the following are **NOT VERIFIED**:

- `npm run typecheck`
- `npm run test:server`
- `npm run test:web`
- `npm run build`

No PASS claim is made for them.

## 8. Final static disposition

For the deterministic/mock Control Plane scope:

- Original seven full-audit findings: remediated at code level.
- Additional hardening findings discovered during the two post-fix review rounds: remediated at code level.
- New code-level HIGH blockers after round 2: none identified.
- Production readiness: **NOT READY** until the integration prerequisites in section 6 and command-level verification are completed.

Recommended next step is **Release Verification / Integration Hardening**, beginning with command-level typecheck/test/build in an executable environment, followed by real auth/session and project authorization adapters before any production-like staging approval.
