# P4 Mutation Center Frontend Increment Review

## Scope

This increment continues P4 on `feat/industry-mutation-p4` after the backend review commit `166417fc0c0467ab2d5c1ae837669e59008a66f4`.

It adds the Mutation Center web client and UI only. P4 remains deterministic mock-only: no real MySQL DML and no browser-visible Approval Token.

## Web routes

```text
/industry/mutations
/industry/mutations/:operationId
/industry/mutations/reconciliation
```

The AppShell exposes Mutation Center as a first-class navigation target while retaining the existing Workspace and Evaluation routes.

## Web API client

`web/src/api/mutation-client.ts` implements:

```text
listMutations
getMutation
confirmMutation
rejectMutation
getMutationAudit
getReconciliation
```

Confirm sends:

```json
{
  "digest": "sha256:<64 hex>",
  "explicitConfirmation": true
}
```

The per-attempt idempotency key is sent only as the `Idempotency-Key` request header. No tenant, company, user, project, role, Approval Token, or other trusted scope is sent by the browser mutation client.

## Mutation Center UI

The UI provides:

- operation list;
- operation detail;
- status badges;
- operation/project/version/digest view;
- Diff / Preview;
- explicit confirmation checkbox;
- confirmation button;
- reject reason + reject action;
- audit timeline;
- reconciliation backlog;
- finalization ambiguity warning;
- 18-digit string ID rendering.

Confirmation controls exist only while an operation is `PENDING_CONFIRMATION`.

Terminal states render without confirm/reject controls:

```text
COMMITTED
REJECTED
RECONCILIATION_REQUIRED
```

## Idempotency behavior

A new `Idempotency-Key` is generated for the first explicit confirmation attempt and retained client-side for that attempt.

If the result is not provably known:

1. automatic retry is forbidden;
2. confirm/reject controls are hidden;
3. only `Refresh status` is available;
4. the same Idempotency-Key remains retained;
5. if refresh proves the operation is still `PENDING_CONFIRMATION`, the UI can resume the same idempotent attempt using the retained key rather than generating a new attempt.

The UI labels this state as:

```text
Resuming the same idempotent attempt
```

## Finalization safety

`MUTATION_COMMIT_FINALIZATION_FAILED` and `MUTATION_UNSAFE_RETRY_FORBIDDEN` are fail-closed.

The UI immediately changes the local operation status to:

```text
RECONCILIATION_REQUIRED
safeToRetryCommit = false
```

before any follow-up GET is attempted.

Therefore, even if the detail/audit/reconciliation refresh also fails, the browser does not re-display a confirmation button.

`APPROVAL_REPLAY` similarly fails closed to local `COMMITTED` state before best-effort evidence refresh.

## Error classification

Errors that clearly occur before commit and are safe to treat as pre-commit failures:

```text
DIGEST_MISMATCH
VERSION_CONFLICT
IDEMPOTENCY_KEY_REUSE
```

For these, the current attempt is cleared and server state is refreshed.

All other unclassified API/transport/malformed-response failures are treated as confirmation-outcome ambiguity and require a status refresh before any further attempt.

## Review round 1

Finding:

The first UI version locked only raw network exceptions. An HTTP/API response that could not prove the commit result (for example an invalid/malformed API response) could leave the pending confirmation controls visible.

Fix:

The confirmation error model was changed from “network error vs API error” to “provably definitive mutation outcome vs ambiguous outcome.” Unknown API outcomes now lock confirmation and require status refresh.

## Review round 2

Finding:

On `MUTATION_COMMIT_FINALIZATION_FAILED`, the UI initially depended on a follow-up `getMutation()` to obtain `RECONCILIATION_REQUIRED`. If that follow-up GET failed, the stale local object could remain `PENDING_CONFIRMATION`, potentially re-exposing confirmation controls.

Fix:

Finalization and unsafe-retry errors now immediately force the local object into `RECONCILIATION_REQUIRED` before evidence refresh. The refresh is best-effort only and no longer determines the safety state.

## Regression coverage

`web/test/mutation-client.test.ts` covers:

- exact confirm body;
- Idempotency-Key header;
- no browser scope/token fields;
- finalization error `retryable:false` and `open_reconciliation` preservation.

`web/test/mutation-center.test.tsx` covers:

- diff/digest/audit rendering;
- 18-digit string ID rendering;
- pending explicit confirmation surface;
- no Approval Token field/content;
- reconciliation state has no confirm/reject controls;
- uncertain confirmation state exposes only status refresh;
- retained attempt is clearly labeled as the same idempotent attempt;
- reconciliation backlog warns that automatic retry is forbidden.

`web/test/app-shell.test.tsx` covers:

- Mutation Center list route;
- safely encoded/decoded operation detail route;
- reconciliation route;
- existing Workspace/Evaluation route regression.

## Verification limitation

The GitHub connector can read/write the repository but cannot execute npm scripts. This review does **not** claim executed PASS for:

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

These remain required before merge/release.

## Next P4 increment

Implement Mutation Eval for:

- wrong target;
- scope leakage;
- confirmation bypass;
- digest mismatch;
- approval replay;
- version conflict;
- finalization/reconciliation fault injection.

After Mutation Eval, perform the full P4 DoD review before entering P5 Trace / Audit + Retrieval Debug.
