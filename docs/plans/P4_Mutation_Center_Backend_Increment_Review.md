# P4 Mutation Center Backend Increment Review

## Scope

This increment starts P4 on `feat/industry-mutation-p4` from the P3 close commit `48f8fffd2b5c2f22e5bf9bc8830bc01f673b1f11`.

It implements the trusted Mutation Center backend contract and deterministic mock state machine only. No real MySQL DML, external mutation service, or browser-visible Approval Token is introduced.

## Implemented API

```text
GET  /api/industry/v1/mutations
GET  /api/industry/v1/mutations/:operationId
POST /api/industry/v1/mutations/:operationId/confirm
POST /api/industry/v1/mutations/:operationId/reject
GET  /api/industry/v1/mutations/:operationId/audit
GET  /api/industry/v1/mutations/reconciliation
```

Confirmation request contract:

```json
{
  "digest": "sha256:<64 hex>",
  "explicitConfirmation": true
}
```

`Idempotency-Key` is mandatory for confirm requests.

## Security properties

- Mutation routes require trusted `industry.mutation` permission.
- Active project is derived from server-side `TrustedRequestContext`.
- Browser-supplied project/user/tenant/company scope is not accepted by mutation contracts.
- Confirm body uses an exact key allowlist; `approvalToken`, `projectId`, and other injected fields are rejected.
- Approval material is generated only inside `MockMutationStore` and is never copied into operation DTOs, audit DTOs, reconciliation DTOs, or error payloads.
- Cross-project operation lookup returns `MUTATION_NOT_FOUND`.
- 18-digit fixture entity IDs remain strings.

## Mock state machine

Three deterministic operation fixtures are created per project:

1. normal commit;
2. version conflict;
3. commit finalization failure.

Normal flow:

```text
PENDING_CONFIRMATION
  -> explicit confirmation
  -> server-only approval
  -> mock commit
  -> COMMITTED
```

No database DML is executed.

## Idempotency / replay

- Same `Idempotency-Key + digest` after a successful commit returns the same committed operation without executing another commit.
- Re-confirming a committed operation with a new key returns `APPROVAL_REPLAY`.
- Reusing the same idempotency key with another digest returns `IDEMPOTENCY_KEY_REUSE`.
- A rejected operation cannot later be confirmed.

## Fault handling

### DIGEST_MISMATCH

Rejected before approval/commit and written to audit.

### VERSION_CONFLICT

Rejected before approval/commit; operation remains `PENDING_CONFIRMATION` for later refresh/rebuild.

### MUTATION_COMMIT_FINALIZATION_FAILED

The mock simulates the dangerous condition where the business write may have succeeded but post-commit finalization failed.

Result:

```text
status = RECONCILIATION_REQUIRED
safeToRetryCommit = false
retryable = false
resolution = open_reconciliation
```

The reconciliation API returns:

```text
businessWriteMayHaveSucceeded = true
automaticRetryForbidden = true
```

Repeating the original request does not execute commit again. A new confirmation attempt is rejected as unsafe.

## Audit

Audit events cover:

- operation creation;
- digest mismatch;
- confirmation acceptance;
- server approval;
- commit success;
- rejection;
- version conflict;
- approval replay blocking;
- commit finalization failure.

Approval Token values are never written to audit detail.

## Review findings fixed

### Round 1

1. Added explicit `industry.mutation` permission enforcement at the BFF boundary.
2. Finalization failures now return the existing `open_reconciliation` resolution instead of forcing the UI to infer remediation.
3. Confirm contracts reject scope and Approval Token injection.

### Round 2

1. Verified `MockIndustryAgentClient` is the only current `IndustryAgentClient` implementation, so the expanded mutation port is complete.
2. Checked committed/reconciliation/rejected terminal-state transitions for key swapping and retry bypasses.
3. Verified the same idempotent request after finalization returns the same failure without another commit attempt.
4. Verified cross-project lookup is scoped by trusted project store.

## Regression coverage added

`server/test/mutation-center.test.ts` covers:

- permission denial;
- missing active project;
- Approval Token / project scope injection rejection;
- mandatory Idempotency-Key;
- successful mock commit;
- same-request idempotency;
- approval replay blocking;
- digest mismatch;
- version conflict;
- finalization failure;
- reconciliation listing;
- unsafe retry blocking;
- rejection terminal state;
- cross-project resource hiding;
- Approval Token absence from public operation/audit payloads.

## Verification limitation

The GitHub connector cannot execute repository npm scripts. As in P3, this increment does not claim that the following commands have been executed successfully:

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

They remain required before merge/release.

## Next increment

Build the P4 Mutation Center web surface and API client:

- operation list/detail;
- diff/preview;
- explicit confirmation using digest;
- generated Idempotency-Key kept client-side per confirmation attempt;
- reject flow;
- audit timeline;
- reconciliation warning surface;
- no automatic retry after commit/finalization ambiguity.

Mutation Eval (wrong target, scope leakage, confirmation bypass, digest mismatch, replay, version conflict, finalization/reconciliation fault injection) follows in the same P4 phase.
