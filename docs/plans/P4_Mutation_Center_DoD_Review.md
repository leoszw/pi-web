# P4 Mutation Center + Mutation Eval DoD Review

## Scope

This document closes P4 on `feat/industry-mutation-p4` at implementation, static-review, and regression-test-definition level.

P4 remains intentionally mock-only. No real MySQL DML is executed and no production approval service is connected.

## Plan DoD

The implementation plan defines P4 completion as:

- browser never receives Approval Token;
- mock confirmation flow is complete;
- conflict/finalization error states are correct;
- unsafe retry does not exist;
- Mutation Eval page/results are viewable;
- no real DML;
- two security review rounds.

All seven requirements are implemented in code and covered by regression tests/static review.

## Mutation Center API

```text
GET  /api/industry/v1/mutations
GET  /api/industry/v1/mutations/:operationId
POST /api/industry/v1/mutations/:operationId/confirm
POST /api/industry/v1/mutations/:operationId/reject
GET  /api/industry/v1/mutations/:operationId/audit
GET  /api/industry/v1/mutations/reconciliation
```

Confirmation accepts only:

```json
{
  "digest": "sha256:<64 hex>",
  "explicitConfirmation": true
}
```

`Idempotency-Key` is mandatory. Project/tenant/user/company scope and Approval Token are not accepted from the browser.

## Trusted mutation state machine

Normal mock path:

```text
PENDING_CONFIRMATION
  -> explicit confirmation
  -> server-only approval material
  -> mock commit
  -> COMMITTED
```

Guard/fault paths cover:

```text
DIGEST_MISMATCH
VERSION_CONFLICT
APPROVAL_REPLAY
MUTATION_COMMIT_FINALIZATION_FAILED
RECONCILIATION_REQUIRED
```

A finalization failure is fail-closed:

```text
business write may have succeeded
safeToRetryCommit = false
automatic retry forbidden
resolution = open_reconciliation
```

The same idempotent request never executes another commit. A new confirmation attempt in an ambiguous finalization state is rejected.

## Browser retry safety

The Mutation Center web UI implements two distinct failure states:

1. **Known finalization ambiguity** — immediately forces local `RECONCILIATION_REQUIRED` before any follow-up GET. Confirm/Reject controls disappear even if the refresh itself fails.
2. **Unknown confirmation outcome** — locks confirmation controls and requires status refresh before another action. The same Idempotency-Key is retained for resuming the same request; a new commit attempt is not generated.

Committed, rejected, and reconciliation-required operations are terminal in the UI.

## Approval material boundary

Approval material is generated only inside `MockMutationStore` and is never included in:

- `MutationOperation`;
- Audit DTOs;
- Reconciliation DTOs;
- UIAction payloads;
- Mutation Center API responses;
- Mutation Eval observations/failures;
- browser confirmation requests.

Regression tests assert browser request bodies and public payloads do not expose Approval Token fields.

## Mutation Eval

### Dataset

```text
mutation-safety-v1
```

Seven critical deterministic cases are included:

1. `WRONG_TARGET`
2. `SCOPE_LEAKAGE`
3. `CONFIRMATION_BYPASS`
4. `DIGEST_MISMATCH`
5. `APPROVAL_REPLAY`
6. `VERSION_CONFLICT`
7. `FINALIZATION_RECONCILIATION`

The finalization case is assigned to `RELEASE_HOLDOUT`; the remaining cases are deterministic regression cases.

### Profiles

```text
mutation-unsafe-v0
mutation-guarded-v1
```

`mutation-unsafe-v0` deliberately demonstrates unsafe behavior so Failure Drilldown contains reproducible failures.

`mutation-guarded-v1` represents the guarded P4 mock control profile and passes all deterministic release gates.

### Batch API

```text
GET  /api/industry/v1/eval/mutation/cases
GET  /api/industry/v1/eval/mutation/runs
POST /api/industry/v1/eval/mutation/runs
GET  /api/industry/v1/eval/mutation/runs/:runId
GET  /api/industry/v1/eval/mutation/runs/:runId/observations
GET  /api/industry/v1/eval/mutation/runs/:runId/failures
```

Mutation Eval uses existing Evaluation permissions (`eval.read` / `eval.run`) and trusted active-project context. It does not require `industry.mutation` because no mutation is executed by the evaluation adapter.

### Metrics / release gate

The Mutation Eval summary exposes:

- pass rate;
- critical pass rate;
- wrong-target failure rate;
- scope leakage rate;
- confirmation bypass rate;
- digest mismatch guard rate;
- approval replay guard rate;
- version conflict guard rate;
- reconciliation safety rate;
- unsafe commit retry rate;
- approval material exposure rate;
- deterministic `PASS` / `FAIL` release gate with explicit reasons.

These are safety gates, not statistical significance metrics. Any deterministic safety regression can fail the release gate.

### UI

```text
/industry/eval/mutation
/industry/eval/runs/:runId/mutation
```

The workbench provides:

- batch run profile selection;
- run history;
- full safety dataset table;
- release gate summary;
- per-case PASS/FAIL;
- Failure Drilldown;
- expected vs actual outcome/code;
- commit attempt count;
- scope leakage / confirmation bypass / unsafe retry flags;
- step-by-step evidence;
- trace links.

The default workbench view intentionally selects the seeded unsafe run so failure analysis is visible immediately.

## Security review round 1

Findings fixed across the P4 backend/frontend increments:

1. Mutation routes require trusted `industry.mutation` permission.
2. Confirmation body uses an exact allowlist and rejects scope/Approval Token injection.
3. Finalization failure returns `retryable: false` plus `open_reconciliation`.
4. Browser confirmation never automatically retries after a network/ambiguous outcome.
5. Unknown confirmation outcomes retain the existing Idempotency-Key instead of creating a new attempt.

## Security review round 2

Findings fixed during frontend and Mutation Eval closeout:

1. A finalization error now switches UI state to `RECONCILIATION_REQUIRED` before evidence refresh, so a second network failure cannot re-expose commit controls.
2. Mutation Eval failure steps are scenario-specific rather than generic, so scope/digest/replay/version/reconciliation failures cannot be hidden behind an aggregate score.
3. Release gate reasons explicitly enumerate wrong target, scope leakage, confirmation bypass, digest, replay, version conflict, reconciliation, unsafe retry, and approval-material exposure regressions.
4. Mutation Eval routes are resolved before the generic `/industry/eval/*` route and run IDs are encoded/decoded safely.
5. Mutation Eval requests do not accept browser-provided trusted scope fields.

## Regression coverage

Server tests cover:

- Mutation Center permission and active project requirements;
- scope/Approval Token injection rejection;
- mandatory Idempotency-Key;
- same-request idempotency;
- approval replay blocking;
- digest mismatch;
- version conflict;
- finalization/reconciliation;
- unsafe retry rejection;
- cross-project resource hiding;
- all seven Mutation Eval safety cases;
- guarded release gate PASS;
- unsafe release gate FAIL;
- failure drilldown reasons;
- Mutation Eval `eval.read` / `eval.run` permissions;
- Mutation Eval project scoping and run request scope-injection rejection.

Web tests cover:

- Mutation Center list/detail/reconciliation routes;
- confirmation request contract and Idempotency-Key header;
- fail-closed reconciliation UI;
- unknown-outcome confirmation lock;
- 18-digit IDs;
- Approval Token absence;
- Mutation Eval workbench and run-result routes;
- all seven safety scenarios;
- unsafe release gate/failure drilldown;
- guarded release gate PASS;
- Mutation Eval request bodies without trusted scope fields.

## Verification limitation

The GitHub connector can read/write repository files but cannot execute repository commands. The execution environment previously could not resolve `github.com`, so this review does **not** claim successful execution of:

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

These commands remain required before merge/release.

## P4 close decision

P4 is complete at implementation + static security review + regression-test-definition level and satisfies the planned P4 DoD.

The next planned phase is **P5: Trace / Audit + Retrieval Debug**, including Trace API/pages, permission-separated debug access, dual-layer redaction, single-request Retrieval Debug, and Trace/Token Eval.
