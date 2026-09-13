# P11 Unified Benchmark + Release Gate DoD Review

## Scope

P11 is implemented on `feat/industry-benchmark-release-p11`, based on the P10 close commit:

```text
32a38dc6af7154dbb12f23803659973d31797eed
```

The implementation remains deterministic and mock-backed. It does **not** claim that a real Phase 11 file containing 1030 labeled cases is present in this repository. No such corpus file was discoverable during this phase. P11 therefore implements the 1030-case manifest/fingerprint/coverage/critical-E2E contract and deterministic run evidence, while leaving ingestion of the real 1030 labeled payload to the future real `pi` evaluation adapter.

P11 does not implement P12 Online Quality Feedback Loop, automatic online-to-Golden promotion, or production release execution.

---

## 1. Shared P11 contract

Added:

```text
shared/industry/eval/p11.ts
```

The contract covers:

- unified benchmark domains;
- Phase 11 corpus manifest;
- total / Golden / Hard / critical counts;
- corpus fingerprint;
- full-coverage requirement;
- unified run;
- critical E2E result;
- reproducibility snapshot;
- PI-owned Release Gate;
- explicit Baseline Acceptance;
- metric delta / regression threshold;
- improved / regressed case movement;
- component version diff;
- retrieval rank movement;
- paired-bootstrap statistical CI;
- independent Release Waiver;
- release disposition separated from the original Gate.

The unified domains are:

```text
INTENT
RETRIEVAL
MUTATION
TRACE
RAG
NORMALIZATION
ENTITY
TOOL
MEMORY
MULTIMODAL
AGENT_LOOP
REPORT
SANDBOX
```

This explicitly includes the P8/P9 specialist families required by the P11 plan: Multimodal, Agent Loop, Report, and Sandbox.

---

## 2. Phase 11 corpus manifest

Mock manifest:

```text
corpusId: phase11-unified-corpus-v1
version: 1.0.0
status: REVIEWED
totalCaseCount: 1030
goldenCount: 820
hardCount: 210
criticalCaseCount: 130
fullCoverageRequired: true
source: PHASE_11_MOCK_MANIFEST
```

Domain counts sum exactly to 1030:

```text
INTENT          100
RETRIEVAL       180
MUTATION         80
TRACE            70
RAG             120
NORMALIZATION    70
ENTITY           70
TOOL             70
MEMORY           70
MULTIMODAL       50
AGENT_LOOP       50
REPORT           50
SANDBOX          50
-------------------
TOTAL          1030
```

The fingerprint is generated deterministically as SHA-256 over the manifest identity/version/domain-count structure.

Important limitation:

```text
P11 models the complete 1030-case manifest and run coverage contract.
It does not materialize 1030 real labeled cases because that source corpus is not present/connected.
```

---

## 3. Unified Benchmark adapter

Added:

```text
server/src/industry/eval/mock-evaluation-client-p11.ts
server/src/industry/eval/mock-evaluation-client-p11-hardening.ts
```

Per trusted project the deterministic adapter seeds:

```text
run-p11-baseline-v1
run-p11-candidate-v2
run-p11-broken-v0
```

It also supports newly created guarded/broken mock runs.

Guarded runs model:

- 1030/1030 coverage;
- reviewed corpus;
- 130/130 critical E2E;
- reproducibility complete;
- PI Gate PASS.

Broken runs model:

- incomplete coverage;
- critical E2E failure;
- critical safety metric failures;
- incomplete reproducibility;
- PI Gate FAIL.

All run state is isolated by trusted active project.

---

## 4. Release Gate ownership

Every run carries:

```text
releaseGate.status
releaseGate.source = PI
releaseGate.ruleVersion
releaseGate.reasons
releaseGate.evaluatedAt
```

The browser never recomputes or overwrites Gate status.

There is no API or UI action for:

```text
Manual PASS
Force PASS
Generic Promote
```

The deterministic mock adapter stands in for the future real `pi` gate provider; the Web surface only renders its result.

---

## 5. Explicit Baseline Accept

Implemented explicit acceptance record:

```text
acceptanceId
projectId
runId
acceptedAt
acceptedBy
explicit = true
```

API:

```text
POST /api/industry/v1/eval/p11/runs/:runId/accept-baseline
```

The body must be exactly:

```json
{}
```

Baseline acceptance requires:

1. run complete;
2. exact 100% coverage;
3. exact current manifest case count (1030);
4. current reviewed manifest version/fingerprint;
5. dataset reviewed;
6. critical E2E pass;
7. PI Gate PASS;
8. reproducibility complete.

A FAIL run remains baseline-ineligible even when it has an ACTIVE Waiver.

Permissions require either:

```text
eval.admin
```

or the combination:

```text
eval.read + eval.baseline.accept
```

`eval.baseline.accept` alone cannot blind-accept a run.

---

## 6. Compare

API:

```text
POST /api/industry/v1/eval/p11/compare
```

Request accepts exactly:

```text
baselineRunId
candidateRunId
```

Both runs must belong to the trusted project and use the same corpus fingerprint.

Compare output contains:

- metric delta;
- regression threshold;
- regressed flag;
- improved / regressed cases;
- complete component version diff across the reproducibility snapshots;
- retrieval rank movement;
- 18-digit entity IDs preserved as strings;
- paired-bootstrap 95% CI;
- conclusive / inconclusive status.

Review hardening changed comparison fixtures so a broken candidate produces coherent negative deltas, regressed cases, worse rank movement, and a negative conclusive CI instead of reusing the guarded candidate's positive fixture.

---

## 7. Waiver semantics

Waiver is explicitly separate from Gate.

API:

```text
GET  /api/industry/v1/eval/p11/waivers
POST /api/industry/v1/eval/p11/runs/:runId/waivers
```

A Waiver can only be created for a run whose original PI Gate is FAIL.

It records:

```text
waiverId
projectId
runId
reason
status
originalGate = FAIL
releaseDisposition = WAIVED
createdBy
createdAt
expiresAt
```

Rules:

- reason length: 20-1000 characters;
- expiry must be in the future and within 30 days;
- only one ACTIVE Waiver per run;
- browser cannot submit projectId, Gate, disposition, or actor;
- Gate remains FAIL under a Waiver;
- Waiver does not make the run baseline eligible.

Permissions require either `eval.admin` or `eval.read + eval.waiver.create`.

---

## 8. P11 BFF

Added:

```text
server/src/industry/eval/p11-router.ts
```

Routes:

```text
GET  /api/industry/v1/eval/p11/corpus
GET  /api/industry/v1/eval/p11/runs
POST /api/industry/v1/eval/p11/runs
GET  /api/industry/v1/eval/p11/runs/:runId
GET  /api/industry/v1/eval/p11/runs/:runId/gate
GET  /api/industry/v1/eval/p11/baseline
POST /api/industry/v1/eval/p11/runs/:runId/accept-baseline
POST /api/industry/v1/eval/p11/compare
GET  /api/industry/v1/eval/p11/waivers
POST /api/industry/v1/eval/p11/runs/:runId/waivers
```

P11 routes are registered before the generic Eval catch-all.

Run creation accepts exactly:

```text
corpusId
variantId
```

The browser cannot submit trusted scope or Gate fields.

---

## 9. Web workbench

Added:

```text
/industry/eval/benchmark
```

Files:

```text
web/src/api/p11-client.ts
web/src/features/eval/UnifiedBenchmarkPage.tsx
```

The page shows:

- Corpus Manifest;
- 1030 total and Golden/Hard counts;
- fingerprint;
- all 13 domain counts;
- Run list;
- coverage;
- critical E2E;
- reproducibility;
- PI Gate and reasons;
- Baseline eligibility;
- explicit Baseline Accept;
- metrics / regression threshold;
- Compare;
- improved / regressed cases;
- version diff;
- rank movement;
- statistical CI;
- Waiver records.

Evaluation Overview is updated to P11 and links to `/industry/eval/benchmark`.

The UI contains explanatory text that there is no Manual PASS and that Waiver leaves the original Gate as FAIL.

---

## 10. Review round 1

Reviewed:

- trusted project scope;
- Baseline acceptance conditions;
- Gate ownership;
- Waiver/Gate separation;
- comparison consistency;
- active Waiver duplication;
- cross-project run isolation;
- action request allowlists.

Fixes:

1. Compare is no longer a fixed candidate fixture for every run; broken candidates now produce coherent regression evidence and negative CI.
2. Dynamic run cross-project isolation is regression-tested using a project-1-created random run ID, then project-2 lookup must return not found.
3. Only one ACTIVE Waiver is allowed per run.
4. Corpus source is displayed explicitly in the UI.
5. Invalid Waiver expiry input disables the UI action before request creation.

---

## 11. Review round 2

Reviewed:

- exact current-manifest binding for Baseline;
- exact 1030 coverage count;
- stale corpus/fingerprint behavior;
- complete version-diff coverage;
- import/prototype registration order;
- P11 vs P12 phase boundary;
- absence of Manual PASS / Force PASS / Promote.

Fixes:

1. Baseline hardening validates exact current manifest version/fingerprint before acceptance.
2. Baseline hardening validates exact current manifest case count and 100% coverage.
3. Compare version diff now covers the full union of component version keys from both reproducibility snapshots.
4. Hardening module explicitly imports the base P11 adapter so prototype registration order is deterministic.

---

## 12. Regression tests

Server:

```text
server/test/p11-unified-benchmark.test.ts
server/test/p11-benchmark-hardening.test.ts
```

Coverage includes:

- active project requirement;
- read/run/baseline/waiver permissions;
- 1030 manifest totals;
- Golden + Hard = 1030;
- domain counts = 1030;
- stable SHA-256 fingerprint;
- P8/P9 domains present;
- guarded run full coverage;
- critical E2E;
- reproducibility;
- PI Gate source/status;
- trusted-scope/Gate injection rejection;
- explicit Baseline acceptance actor/time record;
- FAIL run baseline rejection;
- metric delta / regression threshold;
- improved/regressed cases;
- version diff;
- 18-digit rank-movement IDs as strings;
- paired-bootstrap CI;
- broken comparison negative/conclusive behavior;
- Waiver applicability;
- Waiver body scope/Gate injection rejection;
- duplicate ACTIVE Waiver rejection;
- Gate remains FAIL under Waiver;
- Waiver cannot make Baseline eligible;
- no Manual PASS / Force PASS / Promote route;
- dynamic-run project isolation;
- stale corpus Baseline rejection;
- complete component-version diff.

Web:

```text
web/test/p11-client.test.ts
web/test/p11-benchmark-page.test.tsx
web/test/p11-routing.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes:

- run request contains no trusted scope/Gate fields;
- Baseline Accept uses empty body;
- Waiver payload contains reason/expiry only;
- dedicated Gate/Compare/Baseline/Waiver paths;
- P11 route precedence;
- 1030 manifest display;
- PI Gate display;
- Baseline eligibility action;
- no Manual PASS button;
- Compare evidence families;
- 18-digit rank ID rendering;
- Waiver keeps FAIL visible;
- ineligible/waived run has no Baseline Accept action;
- P11 Evaluation Overview entry.

Both P11 server tests are included in `npm run test:server`; Web tests use the existing `web/test` glob.

---

## 13. Execution status

A command-level verification attempt was made:

```text
git clone --depth 1 --branch feat/industry-benchmark-release-p11 https://github.com/leoszw/pi-web.git
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

The environment failed before repository access:

```text
fatal: unable to access 'https://github.com/leoszw/pi-web.git/':
Could not resolve host: github.com
```

Therefore this review does **not** claim successful execution of typecheck, server tests, Web tests, or build.

Verification state:

```text
implementation complete for mock-backed P11 control-plane behavior
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
+ real 1030 labeled corpus payload not connected
```

---

## 14. P11 result

| Requirement | Result |
| --- | --- |
| 1030 Golden/Hard manifest contract | PASS (mock manifest) |
| Manifest fingerprint | PASS |
| Domain counts sum to 1030 | PASS |
| Full coverage gate | PASS |
| Critical E2E gate | PASS |
| Multimodal / Agent Loop / Report / Sandbox unified | PASS |
| Explicit Baseline Accept | PASS |
| Baseline current-manifest binding | PASS |
| Baseline reproducibility requirement | PASS |
| Metric delta / threshold | PASS |
| Improved / regressed cases | PASS |
| Full component version diff | PASS |
| Rank movement | PASS |
| Statistical CI | PASS |
| PI-owned Gate rendering | PASS |
| No Manual PASS / Force PASS | PASS |
| Separate Waiver | PASS |
| Waiver does not alter Gate or Baseline eligibility | PASS |
| Project isolation | PASS |
| Two static review rounds | PASS |
| Actual 1030 labeled corpus payload | NOT CONNECTED / SOURCE FILE ABSENT |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P11 mock-backed control-plane implementation is ready to hand off to P12 Online Quality Feedback Loop once command-level verification and the real unified corpus source are available.
