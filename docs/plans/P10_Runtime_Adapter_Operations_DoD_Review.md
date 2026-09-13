# P10 Runtime / Adapter + Operations DoD Review

## Scope

P10 is implemented on `feat/industry-runtime-operations-p10`, based on the P9 close commit:

```text
0a24705efdac8ccf07a2f038c08a0866cd435aad
```

The phase remains deterministic and mock-backed. It does **not** connect production model providers, OpenSearch, object storage, Secret Manager/Vault, staging infrastructure, production databases, or production approval systems. It also does not implement the P11 unified benchmark, Baseline Accept, Waiver, Manual PASS, or Promote action.

## Runtime inventory

Added:

```text
shared/industry/runtime.ts
shared/industry/operations.ts
```

Runtime covers the ten planned component families:

```text
AGENT_MODEL
EMBEDDING
RERANKER
OPENSEARCH
PARSER
OBJECT_STORAGE
MULTIMODAL
RENDERER
SANDBOX
TRACE_AUDIT
```

Every row exposes Adapter, Endpoint alias, Configured, Health, Version, Last Check, and Secret Source. Secret information is reference metadata only (`configured/source/reference/lastUpdatedAt`); no secret value, API key, password, bearer credential, access token, or DSN exists in the browser contract.

## Runtime API and UI

Route:

```text
/industry/runtime
```

BFF API:

```text
GET  /api/industry/v1/runtime
GET  /api/industry/v1/runtime/config/drafts
POST /api/industry/v1/runtime/config/drafts
GET  /api/industry/v1/runtime/config/drafts/:draftId
POST /api/industry/v1/runtime/config/drafts/:draftId/validate
POST /api/industry/v1/runtime/config/drafts/:draftId/save
POST /api/industry/v1/runtime/config/drafts/:draftId/eval
```

The only browser-editable values are component, adapter alias, and endpoint alias. Project/user/tenant scope and secret/promotion fields are rejected by the BFF.

## Config Draft Flow

Implemented flow:

```text
Draft
 -> Validate
 -> Diff
 -> Save
 -> config version bump
 -> Eval
 -> eligible for promote
```

P10 intentionally stops at `eligible for promote`. There is no Promote, Manual PASS, Waiver, or Baseline Accept API; P11 owns unified benchmark and release gating.

Every draft binds to the trusted active project and exact `baseVersion`. Validate fails early with `RUNTIME_CONFIG_VERSION_CONFLICT` when the base version is stale, preventing a diff from being computed against a newer configuration. No-op drafts receive `RUNTIME_CONFIG_NOOP` and cannot bump the version. Save requires VALIDATED state, no validation errors, and an exact base-version match. Save increments the config version once.

Eval can run only for the currently active saved version. A PASS sets `eligibleForPromote=true`. Saving a newer config automatically revokes eligibility on older evaluated drafts.

Changing a mock adapter from a `v1` alias to a `v2` alias also updates its displayed component version from `1.0.0` to `2.0.0`; endpoint-only changes leave the adapter version unchanged.

## Secret and alias boundary

Config aliases use a strict non-secret alias syntax and reject representative URL/credential/secret-bearing forms such as:

```text
https://...
sk-live-...
agent-token-primary
password-prod
api_key_prod
```

Serialized runtime inventory is regression-tested not to contain `apiKey`, token values, `sk-*`, password values, or authorization material.

## Runtime authorization

Permissions:

```text
runtime.read
runtime.config.edit
runtime.admin
```

Read endpoints require `runtime.read` or `runtime.admin`.

Config mutations require either `runtime.admin` or the combination `runtime.read + runtime.config.edit`. `runtime.config.edit` by itself cannot blind-write configuration.

Validate/Save/Eval bodies must be exactly an empty JSON object. Drafts are isolated by trusted active project; cross-project lookup returns not found.

## Operations

Route:

```text
/industry/operations
```

BFF:

```text
GET /api/industry/v1/operations/readiness
```

Operations displays exactly the planned readiness families:

```text
CI
ADAPTER_READINESS
STAGING_INFRA
TRACE_AUDIT
EVAL_GATE
E2E
RENDERER
SANDBOX
DB_APPROVAL
PRODUCTION_APPROVAL
```

The current deterministic mock intentionally reports CI, staging infra, Eval Gate, and E2E as `PENDING`; DB approval and production approval are `BLOCKED`. Adapter readiness, Trace/Audit, Renderer, and Sandbox can be `PASS`. Therefore overall readiness is `NOT_READY`.

This avoids false-green status: CI is not marked PASS because command execution is unavailable, and Eval Gate is not marked PASS because P11 unified release gating has not run.

DB and production approval are display-only signals. There are no Approve, Force Pass, Manual PASS, or Promote controls and no approval mutation endpoint.

## Review round 1

Reviewed config version binding, stale drafts, no-op saves, diff correctness, stale eligibility, secret alias handling, secret exposure, and Operations truthfulness.

Fixes:

1. New Saves revoke old evaluated-draft eligibility.
2. Validate fails before diff when `baseVersion` is stale.
3. No-op drafts cannot save/version-bump.
4. URL/credential/secret-like aliases are rejected.
5. CI changed from a false PASS to PENDING.
6. Eval Gate changed from a false PASS to PENDING until P11.

## Review round 2

Reviewed blind-edit authorization, adapter/version consistency, action-body injection, project isolation, P11 boundary, approval boundary, and route precedence.

Fixes:

1. Config changes require read + edit, or admin.
2. Adapter `vN` aliases update displayed component version consistently.
3. Dedicated regression proves edit-only cannot mutate and admin can.
4. P10 still exposes no Promote/Manual PASS/Waiver/Baseline Accept/approval action.

## Regression tests

Server:

```text
server/test/p10-runtime-operations.test.ts
server/test/p10-runtime-auth.test.ts
```

Coverage includes permissions, active project, all ten adapters, secret absence, scope/secret/promotion injection rejection, secret-like alias rejection, full Draft→Validate→Diff→Save→version bump→Eval flow, no Promote route, no-op/unhealthy/stale draft failures, stale eligibility revocation, project isolation, truthful pending/blocked Operations states, no approval API, edit-only denial, admin behavior, and adapter-version consistency.

Web:

```text
web/test/p10-client.test.ts
web/test/p10-pages.test.tsx
web/test/app-shell.test.tsx
```

Coverage includes alias-only request payloads, empty Validate/Save/Eval bodies, Operations GET path, all required Runtime fields, secret source/reference display without secret values, config-flow/eligibility display without a Promote button, all Operations families, display-only approval behavior, and Runtime/Operations route precedence.

Both P10 server files are included in `npm run test:server`; Web tests continue to use the existing `web/test` glob.

## Execution status

An execution attempt was made:

```text
git clone --depth 1 --branch feat/industry-runtime-operations-p10 https://github.com/leoszw/pi-web.git
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

The clone failed before repository access:

```text
fatal: unable to access 'https://github.com/leoszw/pi-web.git/':
Could not resolve host: github.com
```

Therefore this review does **not** claim successful execution of typecheck, server tests, web tests, or build.

Current verification state:

```text
implementation complete
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
```

## P10 result

| Requirement | Result |
| --- | --- |
| Runtime page with ten planned components | PASS (implementation/static review) |
| Adapter / Endpoint alias / Configured / Health / Version / Last Check / Secret Source | PASS |
| Secret values absent | PASS |
| Draft → Validate → Diff → Save → version bump → Eval → eligible | PASS |
| Version conflict / no-op fail-closed | PASS |
| Stale eligibility revocation | PASS |
| No P10 Promote / Manual PASS | PASS |
| Operations ten readiness families | PASS |
| CI truthful status | PASS; PENDING |
| Eval gate truthful status | PASS; P11 pending |
| DB approval display-only | PASS; BLOCKED |
| Production approval display-only | PASS; BLOCKED |
| Two static review rounds | PASS |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P10 is ready to hand off to P11 Unified Benchmark + Release Gate after command-level verification becomes available.
