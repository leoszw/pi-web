# P8 Multimodal + Agent Loop 管理与 Eval DoD Review

## Scope

P8 is implemented on `feat/industry-multimodal-agentloop-p8`, based on the P7 close commit:

```text
77224a21dd1268eb1ed1737c85bd380a4ac964eb
```

The phase remains deterministic and mock-backed. It does **not** connect a production multimodal model, upload image bytes to a model/object store, execute autonomous tools, perform database writes, or bypass the P4 Mutation confirmation model.

---

## 1. Shared contracts

Added:

```text
shared/industry/multimodal.ts
shared/industry/agent-loop.ts
shared/industry/eval/p8.ts
```

Multimodal contracts explicitly model:

- local image metadata;
- Observation;
- bounding box;
- confidence / low-confidence status;
- extracted fields;
- missing fields;
- entity candidates and selected entity;
- review status and corrections;
- no-evidence state;
- prompt-injection blocked state.

Agent Loop contracts explicitly model:

```text
PLAN -> ACT -> VERIFY -> REPLAN -> TERMINATE
```

plus:

- step sequence;
- tool name / critical-tool marker;
- scope-injection blocked marker;
- token and cost per step;
- run-level token/cost/tool/step usage;
- user-provided budgets;
- timeout;
- usage completeness;
- termination reason;
- trace correlation.

---

## 2. Multimodal management UI

Route:

```text
/industry/multimodal
```

The browser supports a real local file picker and local `object URL` preview.

The P8 mock API receives metadata only:

```text
fileName
mimeType
sizeBytes
width?
height?
```

Image bytes are not sent to the mock BFF/model path.

The UI exposes:

- Observation cards;
- bbox;
- confidence;
- LOW CONFIDENCE marker;
- field values and confidence;
- missing-field correction controls;
- server-issued entity candidates;
- Accept / Correct / Reject review actions.

The fixture preserves the 18-digit entity suffix as a string:

```text
engineering-position-123456789012345678
```

---

## 3. Multimodal trusted-boundary rules

BFF routes:

```text
GET  /api/industry/v1/multimodal/analyses
POST /api/industry/v1/multimodal/analyses
GET  /api/industry/v1/multimodal/analyses/:analysisId
POST /api/industry/v1/multimodal/analyses/:analysisId/observations/:observationId/review
```

Permissions:

```text
multimodal.read
multimodal.analyze
multimodal.review
multimodal.admin
```

Missing permissions return explicit `MULTIMODAL_ACCESS_DENIED` instead of being misclassified as a query error.

The browser cannot submit project/tenant/user scope in analysis creation. Active project is always taken from `TrustedRequestContext`.

Observation review is fail-closed:

- selected entity must be one of the server-issued candidates;
- corrected field names must already exist in the observation schema;
- corrected field values must be non-empty strings;
- `ACCEPT` cannot carry field mutations;
- `REJECT` cannot carry field/entity mutations;
- `CORRECT` must contain a field correction and/or valid entity selection.

These semantics are checked both by the BFF parser and by the mock adapter.

---

## 4. Multimodal prompt-injection boundary

The mock image fixture can be marked as containing prompt injection.

That condition becomes observation/evaluation data only:

```text
promptInjectionBlocked = true|false
```

It is never interpreted as an instruction for the control plane.

The Web UI renders observation data through React text rendering; it does not execute embedded image text or raw HTML.

---

## 5. Agent Loop management UI

Route:

```text
/industry/agent-loop
```

The page provides:

- goal;
- deterministic scenario selector;
- max steps;
- max tools;
- max tokens;
- max cost;
- timeout;
- run list;
- run status;
- termination reason;
- usage totals;
- ordered Plan / Act / Verify / Replan / Terminate steps;
- tool / critical-tool / scope-block evidence;
- trace ID.

BFF routes:

```text
GET  /api/industry/v1/agent-loop/runs
POST /api/industry/v1/agent-loop/runs
GET  /api/industry/v1/agent-loop/runs/:runId
```

Permissions:

```text
agent.loop.read
agent.loop.run
agent.loop.admin
```

Missing permissions return `AGENT_LOOP_ACCESS_DENIED`.

The start request accepts only:

```text
goal
budget
scenario?
```

No project/tenant/user/approval scope can be supplied by the browser.

---

## 6. Agent Loop budget enforcement

Review identified that merely capping the final usage counters was not sufficient.

The mock loop now checks budgets **before each work step** and always reserves a Terminate step.

Before entering the next step it validates:

- max steps;
- max tools;
- token budget;
- cost budget;
- timeout.

The first reached budget becomes the termination reason.

This rule applies to every scenario, including ordinary `SUCCESS`, `REPLAN`, `SCOPE_INJECTION`, and `CRITICAL_TOOL`; it is not limited to dedicated budget fixtures.

Regression cases include:

- SUCCESS + maxSteps=2 -> `MAX_STEPS` before the normal success sequence can exceed the budget;
- CRITICAL_TOOL + maxTools=0 -> `MAX_TOOLS`, with no critical tool attempt emitted;
- TOKEN_COST + maxTokens=50 -> token usage never exceeds 50;
- TIMEOUT -> elapsed usage never exceeds timeout.

---

## 7. Critical-tool safety

P8 does not own mutation approval.

The deterministic critical-tool run records the tool as:

```text
status = BLOCKED
toolCritical = true
terminationReason = CRITICAL_TOOL_CONFIRMATION_REQUIRED
```

The UI explicitly states that the critical tool was **not executed** and that explicit confirmation must occur through the P4 Mutation Center.

P8 has no commit endpoint, no Approval Token field, and no code path that executes the write tool.

A tighter tool budget takes precedence: if `maxTools=0`, the loop terminates with `MAX_TOOLS` before reaching the critical tool.

---

## 8. Multimodal Eval

Route:

```text
/industry/eval/multimodal
```

Dataset:

```text
multimodal-safety-v1
```

Six deterministic cases cover:

1. Observation precision/recall;
2. field extraction;
3. entity match;
4. no-evidence reject;
5. prompt-injection block;
6. wrong-target prevention.

Profiles:

```text
p8-broken-v0
p8-guarded-v1
```

The guarded profile passes all gates. The broken profile exposes every safety/fidelity failure in Failure Drilldown.

Specialist metrics use applicable-case denominators. In particular, observation precision/recall is measured on the observation-detection case instead of being diluted by unrelated field/entity/safety cases.

---

## 9. Agent Loop Eval

Route:

```text
/industry/eval/agent-loop
```

Dataset:

```text
agent-loop-safety-v1
```

Nine deterministic cases cover:

```text
SUCCESS
REPLAN
MAX_STEP
MAX_TOOL
TOKEN_COST
TIMEOUT
USAGE_INCOMPLETE
SCOPE_INJECTION
CRITICAL_TOOL
```

Metrics include:

- success gate;
- replan gate;
- max-step enforcement;
- max-tool enforcement;
- token-budget enforcement;
- cost-budget enforcement;
- timeout enforcement;
- usage-accounting gate;
- scope-injection blocking;
- critical-tool safety.

Each specialist safety metric is evaluated against its dedicated applicable case, so a critical failure cannot be hidden by unrelated passing scenarios.

The UI calls `usageCompletenessRate` the **Usage accounting gate** to make the semantics clear: the test is whether incomplete usage is detected/handled safely, not whether the fault fixture itself contains complete accounting.

---

## 10. P8 Eval BFF

Implemented:

```text
GET  /api/industry/v1/eval/p8/:domain/cases
GET  /api/industry/v1/eval/p8/:domain/runs
POST /api/industry/v1/eval/p8/:domain/runs
GET  /api/industry/v1/eval/p8/runs/:runId
GET  /api/industry/v1/eval/p8/runs/:runId/observations
GET  /api/industry/v1/eval/p8/runs/:runId/failures
```

Domains:

```text
multimodal
agent-loop
```

Read requires `eval.read`; run creation requires `eval.run`.

Run creation body has a strict allowlist:

```text
datasetId
variantId
```

Browser-supplied scope fields are rejected.

All P8 run stores remain project-scoped by the server-side trusted context.

---

## 11. Web routing and navigation

Management routes:

```text
/industry/multimodal
/industry/agent-loop
```

Evaluation routes:

```text
/industry/eval/multimodal
/industry/eval/agent-loop
```

They are resolved before generic `/industry/*` and `/industry/eval/*` catch-alls.

The Evaluation Overview is advanced to `Evaluation Workbench · P8` and exposes both P8 specialist labs while preserving P0-P7 entries.

---

## 12. Review round 1

Reviewed:

- shared contract consistency;
- trusted project boundary;
- management permissions;
- route precedence;
- image metadata boundary;
- bbox/low-confidence/missing-field representation;
- Agent Loop budget/usage semantics;
- P8 Eval denominator correctness.

Fixes made:

1. Management permission failures now use explicit access-denied domain errors.
2. Agent Loop budget behavior was changed from final-counter capping to actual budget-aware execution.
3. Multimodal observation precision/recall now use the observation-detection case as their applicable denominator.
4. Regression assertions were added for budget usage and explicit permission codes.

---

## 13. Review round 2

Reviewed:

- prompt-injection content cannot become an instruction;
- server-issued entity-candidate boundary;
- field correction schema boundary;
- review decision semantics;
- 18-digit ID preservation;
- browser payloads contain no trusted scope/Approval Token;
- global Agent Loop budget precedence;
- critical-tool confirmation boundary;
- P4 Mutation Center remains the only mock write-confirmation path;
- P8 does not introduce P9 Report/Sandbox capability.

Fixes made:

1. `ACCEPT`, `CORRECT`, and `REJECT` now have mutually consistent payload semantics.
2. Empty field corrections are rejected.
3. Adapter performs the same review checks defensively even if called outside the HTTP route.
4. Budget checks now run before every scenario step, including SUCCESS and CRITICAL_TOOL.
5. Web client tests explicitly verify that multimodal review and loop-start payloads contain no project/tenant/user/Approval Token material.
6. Usage Eval wording was clarified to `Usage accounting gate`.

---

## 14. Regression tests

Server:

```text
server/test/p8-management-eval.test.ts
```

Coverage includes:

- explicit permission errors;
- active-project requirement;
- browser project scope injection rejection;
- bbox / low confidence / missing field;
- prompt-injection blocked fixture;
- 18-digit entity string;
- entity candidate allowlist;
- corrected-field allowlist;
- review decision semantics;
- cross-project analysis hiding;
- critical-tool blocked state;
- scope injection blocked state;
- global step/tool/token/cost/timeout budgets;
- P8 case counts;
- guarded profile PASS;
- broken profile deterministic FAIL;
- P8 Eval scope injection rejection.

Web:

```text
web/test/p8-client.test.ts
web/test/p8-pages.test.tsx
web/test/app-shell.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes:

- same-origin API paths;
- metadata-only image request;
- review payload trusted-scope exclusion;
- Agent Loop trusted-scope / Approval Token exclusion;
- local-preview management UI contract;
- bbox / low confidence / missing fields / entity IDs;
- full loop phase and budget display;
- critical-tool warning;
- Multimodal Eval metrics and Failure Drilldown;
- all Agent Loop metric families;
- P8 route precedence;
- P8 Evaluation Overview links.

---

## 15. Execution status

The server regression file is included in `test:server`; Web tests are covered by the existing `vitest run web/test` glob.

An executable verification attempt was made, but the environment failed before repository checkout:

```text
fatal: unable to access 'https://github.com/leoszw/pi-web.git/':
Could not resolve host: github.com
```

Therefore this review does **not** claim successful execution of:

```text
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

Current status:

```text
implementation complete
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
```

---

## 16. P8 DoD result

| Requirement | Result |
| --- | --- |
| Image input + local preview | PASS (implementation/static review) |
| Observation / bbox / low confidence | PASS |
| Entity review / missing fields | PASS |
| Multimodal Eval metric families | PASS |
| No-evidence / prompt-injection / wrong-target safety | PASS |
| Agent Loop Run management | PASS |
| Plan / Act / Verify / Replan / Terminate display | PASS |
| Step/tool/token/cost/timeout budgets | PASS |
| Agent Loop Eval scenarios | PASS |
| Scope-injection blocking | PASS |
| Critical-tool fail-closed / P4 confirmation boundary | PASS |
| Browser trusted-scope / Approval Token exclusion | PASS |
| Two review rounds | PASS |
| Real image model/tool execution | NOT IN P8 (mock only) |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P8 is ready to hand off to P9 after command-level verification becomes available.
