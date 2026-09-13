# P5 Trace / Audit + Retrieval Debug DoD Review

## Scope

P5 is implemented on `feat/industry-trace-p5`, starting from the P4 close commit `ba8cf59b941b2283933fcf04d6ebed50d2b2b7f0`.

This phase remains deterministic and mock-backed. It does not connect a production tracing backend, OpenSearch, MySQL DML, or a real LLM.

## 1. Trace API

Implemented under the Industry BFF namespace:

```text
GET /api/industry/v1/traces
GET /api/industry/v1/traces/:traceId
GET /api/industry/v1/traces/:traceId/timeline
GET /api/industry/v1/traces/:traceId/tree
GET /api/industry/v1/traces/:traceId/stats
GET /api/industry/v1/traces/:traceId/retrieval-debug
```

All trace resources are resolved from server-side `TrustedRequestContext`. Cross-project trace IDs are returned as `TRACE_NOT_FOUND`.

Trace stats include:

- duration;
- query latency;
- LLM call count;
- tool call count;
- input tokens;
- output tokens;
- total tokens;
- span count;
- error count.

The deterministic retrieval trace records `428 + 96 = 524` tokens so accounting consistency is testable.

## 2. Permission tiers

Trace surfaces are separated by trusted principal permission:

```text
trace.read.basic
trace.read.debug
trace.read.prompt
audit.read
```

`trace.admin` is the server-side override.

Rules:

- every trace route requires `trace.read.basic`;
- basic detail contains summary/spans but no span input/output/attributes;
- `trace.read.debug` exposes debug payloads and is required for Retrieval Debug;
- `trace.read.prompt` independently exposes prompt records;
- `audit.read` independently exposes audit records;
- the browser cannot request or inject a higher access profile;
- Retrieval Debug navigation is hidden unless the returned detail confirms debug access.

## 3. Dual-layer redaction

### BFF layer

The mock trace projection recursively masks sensitive keys and secret-looking text before returning debug, prompt, audit, span input/output, or span attributes.

The fixture intentionally includes examples of:

- Authorization / Bearer values;
- Cookie values;
- API keys (`sk-*`);
- Approval Tokens (`approval-*`);
- MySQL/PostgreSQL DSNs.

Regression tests assert that the original values do not survive API projection even when the caller has all trace permissions.

### Web layer

`trace-redaction.ts` performs a second independent masking pass for Raw/Debug, Prompt, Audit, and timeline textual content.

The Web test intentionally feeds an unsafe unredacted payload directly into the view and asserts that raw secret values are not rendered.

This is defense in depth; Web masking is not a substitute for BFF authorization or redaction.

## 4. Trace Explorer UI

Routes:

```text
/industry/traces
/industry/traces/:traceId
```

The Trace detail page provides:

- Overview;
- Timeline;
- Span Tree;
- Raw / Debug.

Overview exposes trace/token/tool statistics and the granted trace surfaces. Raw/Debug does not synthesize unavailable Prompt/Audit/Debug data; it displays permission guidance instead.

## 5. Retrieval Debug

Route:

```text
/industry/debug/retrieval/:traceId
```

API source:

```text
GET /api/industry/v1/traces/:traceId/retrieval-debug
```

Retrieval Debug is explicitly different from Retrieval Eval.

```text
Debug = one trace / one request / troubleshooting
Eval  = dataset + batch + metrics + compare + release conclusions
```

The Debug page exposes the complete deterministic chain:

```text
Semantic Parse
Hard Filters
Exact
BM25
Dense
Entity-aware
RRF
Reranker
Business Feature
Final
```

Candidate drilldown includes source arms, score provenance, reasons, hard negatives, critical spec conflicts, and entities removed by hard filters.

No Dataset Run, A/B Compare, aggregate metric, or Release Gate is produced by this page.

Retrieval Debug requires both basic Trace access and `trace.read.debug`.

## 6. Trace / Token Eval

Dataset:

```text
trace-safety-v1
```

Routes:

```text
GET  /api/industry/v1/eval/trace/cases
GET  /api/industry/v1/eval/trace/runs
POST /api/industry/v1/eval/trace/runs
GET  /api/industry/v1/eval/trace/runs/:runId
GET  /api/industry/v1/eval/trace/runs/:runId/observations
GET  /api/industry/v1/eval/trace/runs/:runId/failures
```

Web routes:

```text
/industry/eval/trace
/industry/eval/runs/:runId/trace
```

Six critical scenarios are deterministic gates:

1. Trace completeness;
2. Sequence monotonicity;
3. Token accounting consistency;
4. Tool audit completeness;
5. Redaction leak;
6. Query latency budget.

Two profiles are seeded per trusted project:

```text
trace-broken-v0
trace-guarded-v1
```

The broken profile intentionally produces all six failures for Failure Drilldown. The guarded profile passes all six gates.

Trace Eval uses `eval.read` / `eval.run` and rejects browser scope injection. Each observation links back to the trusted-project trace used as evidence.

Safety and redaction failures are deterministic release failures. They are not weakened by sample-size statistics or averaged into a passing conclusion.

## 7. Regression coverage

Server coverage includes:

- basic Trace permission and active project requirements;
- independent debug/prompt/audit permission projection;
- cross-project trace hiding;
- BFF secret redaction;
- timeline monotonicity;
- Span Tree hierarchy;
- token accounting consistency;
- Retrieval Debug permission, trace type and project isolation;
- all ten Retrieval Debug stages;
- Trace Eval read/run permissions;
- Trace Eval scope injection rejection;
- guarded Trace Eval PASS;
- broken Trace Eval six-case Failure Drilldown;
- project-isolated seeded Trace Eval runs.

Web coverage includes:

- Trace list/detail routing;
- Overview/Timeline/Span Tree/Raw Debug rendering;
- Web-side secret masking;
- Retrieval Debug capability link visibility;
- Retrieval Debug versus Eval route separation;
- all ten debug stages and score provenance;
- Trace Eval API paths;
- Trace Eval workbench/result routing;
- broken Release Gate FAIL and Failure Drilldown;
- guarded Release Gate PASS;
- P5 Evaluation Overview entry point.

## 8. Review round 1

Findings and fixes:

1. Trace Eval is routed through a dedicated subrouter before the generic Eval router, avoiding accidental swallowing or further growth of the P1/P2/P4 router.
2. Both module-augmentation adapters are explicitly registered at runtime: Trace Eval and trace-backed Retrieval Debug.
3. Retrieval Debug remains under Trace access, not Eval access, and cannot be opened with `trace.read.basic` alone.
4. Web routing keeps single-trace Debug distinct from Retrieval Eval and from the generic Industry Workspace route.
5. A Basic Trace user originally saw a Retrieval Debug link that would later return 403. The UI now hides that capability until debug access is actually present in the returned server projection.

## 9. Review round 2

Security and semantics checked:

1. Debug, Prompt, and Audit fields are not inferred or enabled by browser parameters.
2. Approval Token, Authorization, Cookie, API key, and DSN fixture values are blocked at the BFF projection and masked again in the Web debug viewer.
3. Timeline sequence is reconstructed as contiguous and monotonic.
4. Token totals remain independently represented as input/output/total and are covered by deterministic consistency checks.
5. Tool audit completeness and redaction leak are deterministic gates.
6. Retrieval Debug contains no Dataset/Batch/A-B/Release Gate semantics.
7. Trace Eval Failure Drilldown links to a project-scoped trace rather than embedding elevated debug material.
8. No P6 Knowledge/RAG functionality was introduced in P5.

## 10. P5 DoD conclusion

P5 scope is functionally closed at code and regression-definition level:

- Trace API: implemented;
- Overview / Timeline / Span Tree / Raw Debug: implemented;
- permission tiers: implemented;
- BFF + Web dual redaction: implemented;
- Retrieval Debug: implemented and separated from Eval;
- trace/token/tool/audit/latency Eval: implemented;
- two review rounds: completed;
- mock-only architecture: preserved.

## 11. Verification limitation

The GitHub connector can read and write repository content but cannot execute repository npm scripts. Therefore this review does **not** claim successful execution of:

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

Those commands remain mandatory before merge/release in an executable repository environment.

## 12. Next phase

P6 is Knowledge/RAG + RAG Eval: document/upload/ingestion management, server-authorized ACL scope, retrieval metrics, answer/citation evaluation, Citation Inspector, and deterministic ACL leakage checks before any real object storage or OpenSearch integration.
