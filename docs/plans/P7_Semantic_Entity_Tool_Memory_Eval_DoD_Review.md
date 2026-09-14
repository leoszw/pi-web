# P7 Semantic / Entity / Tool / Memory Eval DoD Review

## Scope

P7 is implemented on `feat/industry-semantic-p7`, based on the P6 close commit:

```text
f6fd73daa716df1d0f9cf2df8e0a874684cee47c
```

The phase remains deterministic and mock-backed. It does not introduce a production normalizer, entity resolver, tool executor, memory backend, database mutation, or real model call.

---

## 1. Shared P7 Eval contract

Added:

```text
shared/industry/eval/p7.ts
```

The contract defines four explicit domains:

```text
NORMALIZATION
ENTITY
TOOL
MEMORY
```

Each domain has typed cases, shared run/observation/failure contracts, deterministic metrics, and a Trace-created Draft contract.

Profiles:

```text
p7-broken-v0
p7-guarded-v1
```

`p7-broken-v0` intentionally exposes reproducible failures. `p7-guarded-v1` passes all P7 release gates.

---

## 2. Normalization Lab

Route:

```text
/industry/eval/normalization
```

Dataset:

```text
normalization-safety-v1
```

Coverage is explicit for all P7 plan categories:

```text
CHAINAGE
RANGE
ALIGNMENT
SIDE
UNIT
BOQ_CODE
DATE
SPECIFICATION
ABBREVIATION
```

The workbench exposes cases, batch runs, normalization accuracy, expected/actual canonical representations, and Failure Drilldown.

Broken profile examples intentionally fail range, side, specification, and abbreviation normalization.

---

## 3. Entity Lab

Route:

```text
/industry/eval/entity
```

Dataset:

```text
entity-safety-v1
```

Failure stages are first-class values rather than free-form notes:

```text
MENTION
CANDIDATE_GENERATION
RANKING
SCOPE
AMBIGUITY
```

The broken profile contains one deterministic failure at every stage, so the UI can show both the total resolution rate and per-stage failure counts.

The fixture includes the string ID:

```text
engineering-position-123456789012345678
```

Web regression coverage verifies that the 18-digit suffix is rendered as a string and is never converted through JavaScript `Number`.

---

## 4. Tool Eval

Route:

```text
/industry/eval/tool
```

Dataset:

```text
tool-safety-v1
```

Metrics cover the P7 plan requirements:

- selection accuracy;
- argument exact rate;
- missing required argument rate;
- unknown argument rate;
- scope injection blocked rate;
- unnecessary tool rate;
- tool sequence accuracy.

The deterministic dataset includes:

- wrong tool selection;
- missing `code` argument;
- unknown/forbidden argument injection;
- attempted `projectId / tenantId / userId` scope injection;
- unnecessary tool invocation for a greeting;
- reversed multi-tool sequence;
- context-backed export selection.

### Applicable-case denominator review fix

During review, safety metrics were changed so specialist gates are evaluated only over the cases where they apply:

- scope-injection blocked rate uses the scope-injection case;
- unnecessary-tool rate uses the no-tool case;
- sequence accuracy uses the multi-tool sequence case;
- argument metrics exclude the no-tool case.

This avoids a critical scope failure being diluted by unrelated passing cases.

---

## 5. Memory Eval

Route:

```text
/industry/eval/memory
```

Dataset:

```text
memory-safety-v1
```

Required context-dependent expressions are represented directly:

```text
这些
那些
刚才那些
第二个
只看未完成的
继续
把这些导出来
```

Additional dedicated policy cases cover:

- project isolation;
- TTL expiry;
- source policy / untrusted source rejection.

Metrics:

- context reference resolution accuracy;
- project-isolation rate;
- TTL-policy rate;
- source-policy rate.

### Applicable-case denominator review fix

The three safety-policy metrics use their dedicated policy cases rather than all ordinary reference-resolution cases. Therefore a policy violation is deterministic and cannot be hidden by unrelated successful pronoun-resolution cases.

---

## 6. P7 BFF API

Implemented under:

```text
GET  /api/industry/v1/eval/p7/:domain/cases
GET  /api/industry/v1/eval/p7/:domain/runs
POST /api/industry/v1/eval/p7/:domain/runs
GET  /api/industry/v1/eval/p7/runs/:runId
GET  /api/industry/v1/eval/p7/runs/:runId/observations
GET  /api/industry/v1/eval/p7/runs/:runId/failures
GET  /api/industry/v1/eval/p7/drafts
POST /api/industry/v1/eval/p7/drafts/from-trace
```

Read paths require `eval.read`; run creation requires `eval.run`.

Run creation has a strict body allowlist:

```text
datasetId
variantId
```

Browser-supplied `projectId`, `tenantId`, `userId`, or other scope fields are rejected.

All runs remain bound to server-side `TrustedRequestContext.projectId`.

---

## 7. Trace → Add to Eval Draft

Trace Overview now contains an `Add to Eval Draft` control with target choices:

```text
NORMALIZATION
ENTITY
TOOL
MEMORY
```

The browser request contains only:

```json
{
  "traceId": "...",
  "targetDomain": "..."
}
```

It cannot submit project/user/tenant scope.

The BFF requires both:

```text
eval.dataset.edit
trace.read.basic
```

Before creating the Draft, the server reads the Trace through the active trusted project context. A trace belonging to another project therefore resolves as not found.

Created records are structurally fixed as:

```text
status   = DRAFT
reviewed = false
```

P7 exposes no promote-to-Golden API. Tests also verify that a guessed `/drafts/:id/promote` route does not exist.

This makes the required policy explicit:

```text
Trace -> Draft -> human review later
```

and never:

```text
Trace -> Golden automatically
```

---

## 8. Web workbench

Evaluation Overview is updated to P7 and links to all four specialist Labs.

The shared `P7EvalPage` provides, per domain:

- dataset identity;
- broken/guarded profile selection;
- run list;
- Release Gate;
- domain-specific metrics;
- case table;
- expected vs actual output;
- failure stage;
- Failure Drilldown;
- project Trace correlation ID;
- Trace-created Draft list.

P7 routes are resolved before the generic `/industry/eval/*` catch-all.

---

## 9. Review round 1

Reviewed:

- Trusted project boundary;
- run body allowlists;
- Trace Draft permission combination;
- Draft/Golden separation;
- entity failure-stage completeness;
- Tool and Memory metric semantics;
- P0-P6 route preservation.

Fixes made:

1. Tool specialist metrics were changed to applicable-case denominators.
2. Memory project-isolation / TTL / source-policy metrics were changed to dedicated policy-case denominators.
3. Trace Draft creation requires both Eval edit and Trace basic permissions.
4. Cross-project Trace Draft creation is covered by a 404 regression test.

---

## 10. Review round 2

Reviewed:

- all four plan-required Normalization categories;
- all five Entity failure stages;
- all seven Tool metric families;
- all required contextual Memory phrases;
- project isolation / TTL / source policy;
- 18-digit string IDs;
- Web route precedence;
- Trace Draft request payload;
- absence of Golden promotion;
- no P8 multimodal / Agent Loop implementation leaking into P7.

No real Tool execution, business mutation, persistent Memory service, or autonomous Agent Loop was added.

---

## 11. Regression tests added

Server:

```text
server/test/p7-eval-router.test.ts
```

Coverage includes:

- `eval.read` + active-project requirements;
- complete Normalization category set;
- Entity failure stages;
- Tool safety metrics;
- Memory phrases and policy gates;
- browser scope-injection rejection;
- guarded run PASS;
- broken run Failure Drilldown;
- Trace Draft permissions;
- Draft remains unreviewed;
- no promote endpoint;
- cross-project Trace isolation.

Web:

```text
web/test/p7-client.test.ts
web/test/p7-eval.test.tsx
web/test/trace-eval-draft.test.tsx
web/test/app-shell.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes P7 API paths, same-origin behavior, Trace Draft body allowlist, four Lab routes, domain metrics, failure stages, 18-digit ID preservation, Draft status, and absence of Promote UI.

---

## 12. Execution status

The test definitions are included in `test:server` and the existing `test:web` glob.

An execution attempt was made from the available container, but networking failed before repository access:

```text
fatal: unable to access 'https://github.com/leoszw/pi-web.git/':
Could not resolve host: github.com
```

Therefore this review does **not** claim that the following commands have executed successfully:

```text
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

Current status is:

```text
implementation complete
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
```

---

## 13. P7 DoD result

| Requirement | Result |
| --- | --- |
| Normalization specialist Eval | PASS (implementation/static review) |
| Entity specialist Eval + failure stages | PASS (implementation/static review) |
| Tool specialist Eval | PASS (implementation/static review) |
| Memory specialist Eval | PASS (implementation/static review) |
| Case / Run / Failure Drilldown for all four | PASS |
| Trace -> Add to Eval Draft | PASS |
| Draft does not automatically enter Golden | PASS |
| Trusted project/scope boundary | PASS |
| Two review rounds | PASS |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P7 is ready to hand off to P8 once an executable environment performs the pending command-level verification.
