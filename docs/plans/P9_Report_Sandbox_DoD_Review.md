# P9 Report + Sandbox 管理与 Eval DoD Review

## Scope

P9 is implemented on `feat/industry-report-sandbox-p9`, based on the P8 close commit:

```text
03587450a3a183240ce886aadacb595bacea4d77
```

The phase remains deterministic and mock-backed. It does **not** connect real object storage, generate/download real report bytes, execute SQL against MySQL, run Python in a real sandbox, access the network/process/filesystem, or introduce P10 runtime/adapter operations.

---

## 1. Shared contracts

Added:

```text
shared/industry/report.ts
shared/industry/sandbox.ts
shared/industry/eval/p9.ts
```

Report contracts explicitly model:

- report metadata and format;
- preview;
- evidence and coverage;
- lineage;
- security summary;
- trace correlation;
- short-lived authorized download grant.

Sandbox contracts explicitly model:

- Goal;
- schema;
- server-generated SQL;
- validation findings;
- queryId;
- Broker policies;
- server-generated Python source and SHA-256 hash;
- runtime attestation;
- bounded output;
- lineage;
- termination reason;
- trace correlation.

The browser-facing start contract contains only:

```text
goal
budget.maxRows
budget.maxBytes
budget.timeoutMs
scenario?  // deterministic mock fixture selector only
```

There is no client SQL, Python source, queryId, projectId, tenantId, or userId field.

---

## 2. Report Center

Route:

```text
/industry/reports
```

BFF API:

```text
GET  /api/industry/v1/reports
GET  /api/industry/v1/reports/:reportId
POST /api/industry/v1/reports/:reportId/download
```

The management UI exposes the P9 plan requirements:

- list;
- preview;
- metadata;
- evidence;
- lineage;
- security summary;
- authorized download grant.

Mock fixtures include safe PDF and XLSX reports with evidence and lineage.

### Authorized download boundary

The browser does not construct a filesystem path or direct object-storage URL.

The POST download operation:

1. requires an active trusted project;
2. requires both `report.read` and `report.download`, or `report.admin`;
3. accepts only an empty JSON object;
4. re-resolves the report inside the active trusted project;
5. returns a five-minute mock grant containing an opaque `artifactRef`;
6. uses `Content-Disposition: attachment` semantics in the grant contract.

The UI renders the `artifactRef` as diagnostic text, not as an `href`.

P9 intentionally does not return real report bytes because object storage is not connected in this phase.

---

## 3. Report security model

Each `ReportArtifact` carries server-side security assertions for:

```text
hiddenFieldBlocked
activeContentBlocked
externalLinksBlocked
macroBlocked
pdfActionsBlocked
svgScriptsBlocked
safePath
sizeWithinLimit
completedWithinTimeout
```

Report Preview, metadata, evidence references, lineage labels, and artifact references are rendered through normal React text nodes only.

Regression tests inject strings containing:

```text
<script>
<img onerror=...>
javascript:...
https://evil.example
```

and verify that they remain escaped text and do not become executable HTML or links.

---

## 4. Report Eval

Route:

```text
/industry/eval/report
```

Dataset:

```text
report-safety-v1
```

Profiles:

```text
p9-broken-v0
p9-guarded-v1
```

The dataset contains one deterministic specialist case for each P9 plan requirement:

```text
HIDDEN_FIELD
EVIDENCE_COVERAGE
ACTIVE_CONTENT
EXTERNAL_LINK
XLSX_MACRO
PDF_ACTION
SVG_SCRIPT
PATH_TRAVERSAL
SIZE
TIMEOUT
```

Metrics:

- hidden-field blocked rate;
- evidence coverage rate;
- active-content blocked rate;
- external-link blocked rate;
- XLSX macro blocked rate;
- PDF action blocked rate;
- SVG script blocked rate;
- path-traversal blocked rate;
- size-limit enforcement rate;
- timeout enforcement rate.

Each specialist safety metric uses its dedicated case. Critical failures therefore cannot be diluted by unrelated passing samples.

`p9-broken-v0` deterministically exposes all ten failures. `p9-guarded-v1` passes the Report release gate.

---

## 5. Sandbox management UI

Route:

```text
/industry/sandbox
```

BFF API:

```text
GET  /api/industry/v1/sandbox/runs
POST /api/industry/v1/sandbox/runs
GET  /api/industry/v1/sandbox/runs/:runId
```

The UI exposes:

```text
Goal
Schema
Generated SQL
Validation
queryId
Broker policies
Python source
Python hash
Runtime attestation
Output
Lineage
Trace
```

The page deliberately has **no arbitrary SQL or Python console**.

SQL/Python/queryId are display-only server outputs.

---

## 6. Sandbox trusted-boundary rules

Permissions:

```text
sandbox.read
sandbox.run
sandbox.admin
```

The BFF strictly rejects extra start fields including:

```text
generatedSql
sql
pythonSource
queryId
projectId
tenantId
userId
```

All project scope continues to come from `TrustedRequestContext`.

Cross-project run lookup returns not found.

The safe SQL fixture uses:

- explicit columns;
- a trusted project parameter;
- a bounded result;
- no `SELECT *`;
- no system schema;
- no file function;
- no write statement.

---

## 7. Sandbox pre-execution policy gates

Dangerous deterministic scenarios are rejected before query execution and therefore receive no queryId:

```text
WRITE_SQL
SELECT_STAR
LOAD_FILE
SYSTEM_SCHEMA
PYTHON_IMPORT_OPEN_NETWORK_PROCESS
ATTESTATION failure
```

Corresponding validation findings include:

```text
WRITE_SQL_REJECTED
SELECT_STAR_REJECTED
LOAD_FILE_REJECTED
SYSTEM_SCHEMA_REJECTED
PYTHON_CAPABILITY_REJECTED
ATTESTATION_FAILED
```

Python diagnostic source is never executed in P9. The runtime attestation contract explicitly records:

```text
networkDisabled = true
processSpawnDisabled = true
filesystemReadOnly = true
verified
```

Diagnostic SQL/Python strings are rendered as escaped React text, including malicious-looking markup.

---

## 8. Dynamic queryId and budgets

`queryId` is generated only by the server-side mock adapter after validation. The browser cannot provide or reuse its own queryId.

The `DYNAMIC_QUERY_ID` scenario verifies server-generated query identity.

Budget behavior is enforced on the actual returned result, not only on counters:

- `maxRows` truncates rows;
- `maxBytes` drops rows until the serialized row payload fits the byte budget;
- `timeoutMs` produces `TIMEOUT` when the mock nominal execution would exceed the configured limit;
- row/byte limiting produces `PAYLOAD_BUDGET`.

The output continues to preserve 18-digit business IDs as strings, for example:

```text
123456789012345678
```

---

## 9. Sandbox Eval

Route:

```text
/industry/eval/sandbox
```

Dataset:

```text
sandbox-safety-v1
```

The eight deterministic specialist cases are:

```text
WRITE_SQL
SELECT_STAR
LOAD_FILE
SYSTEM_SCHEMA
PYTHON_CAPABILITY
DYNAMIC_QUERY_ID
ATTESTATION
PAYLOAD_BUDGET
```

Metrics:

- write-SQL reject rate;
- `SELECT *` reject rate;
- `LOAD_FILE` reject rate;
- system-schema reject rate;
- Python capability blocked rate;
- dynamic-queryId safety rate;
- attestation verified rate;
- payload-budget enforcement rate.

Again, every metric uses the case to which it applies.

`p9-broken-v0` exposes every gate failure; `p9-guarded-v1` passes the Sandbox release gate.

---

## 10. P9 Evaluation BFF

Implemented:

```text
GET  /api/industry/v1/eval/p9/:domain/cases
GET  /api/industry/v1/eval/p9/:domain/runs
POST /api/industry/v1/eval/p9/:domain/runs
GET  /api/industry/v1/eval/p9/runs/:runId
GET  /api/industry/v1/eval/p9/runs/:runId/observations
GET  /api/industry/v1/eval/p9/runs/:runId/failures
```

Read paths require `eval.read`; run creation requires `eval.run`.

Run creation accepts exactly:

```text
datasetId
variantId
```

Browser-supplied project/tenant/user scope is rejected.

P9 Evaluation routes are registered before the generic Evaluation catch-all.

---

## 11. Web integration

Added primary management navigation:

```text
Reports
Sandbox
```

Added Evaluation entry points:

```text
/industry/eval/report
/industry/eval/sandbox
```

Evaluation Overview is updated to P9 and shows Report and Sandbox safety suites.

All P0-P8 routes remain resolved before the generic Industry catch-all as appropriate.

---

## 12. Review round 1

Reviewed:

- trusted project scope;
- Report download authorization;
- Report download request body;
- Sandbox request allowlist;
- arbitrary SQL/Python prohibition;
- queryId ownership;
- row/byte/timeout budgets;
- P9 metric denominators;
- route precedence.

Fixes made:

1. Report download now rejects any non-empty request body, preventing scope/path injection.
2. Report download now requires both `report.read` and `report.download` unless the principal has `report.admin`.
3. Sandbox byte enforcement now changes the actual rows returned instead of only truncating the displayed byte counter.
4. `maxRows` now produces bounded output and `PAYLOAD_BUDGET` when rows are cut.
5. `timeoutMs` now changes the run termination to `TIMEOUT` when the nominal execution exceeds the limit.
6. Router error handling now explicitly accepts `EvaluationClientError` rather than exposing arbitrary errors merely because they contain `code/statusCode` properties.

---

## 13. Review round 2

Reviewed:

- Report preview active-content safety;
- external-link and `javascript:` text behavior;
- artifact reference behavior;
- SQL/Python diagnostic rendering;
- dangerous Sandbox scenarios before queryId creation;
- runtime attestation failure;
- dynamic queryId;
- 18-digit string IDs;
- P0-P8 route preservation;
- absence of P10 Runtime/Adapter implementation.

Fixes / regression locks:

1. Report malicious preview/metadata/evidence fixtures are verified as escaped text; no raw script/link is produced.
2. Sandbox malicious SQL/Python diagnostic text is verified as escaped text.
3. Report artifact grants remain non-clickable diagnostic references in P9.
4. A principal possessing only `report.read` or only `report.download` cannot authorize a download.
5. Dangerous SQL/Python and failed attestation continue to return `queryId = null`.

No real SQL, Python, file, network, process, report byte, or object-storage operation was added.

---

## 14. Regression tests

Server:

```text
server/test/p9-management-eval.test.ts
```

Coverage includes:

- explicit management permission failures;
- combined Report read/download permission;
- active project requirement;
- Report evidence/lineage/security;
- download body scope injection rejection;
- opaque short-lived download grant;
- cross-project Report isolation;
- Sandbox arbitrary SQL/Python/queryId/scope rejection;
- safe explicit-column SQL;
- server-generated queryId;
- dangerous capability pre-query blocking;
- row/byte/timeout enforcement on actual output;
- attestation failure;
- 18-digit ID preservation;
- cross-project Sandbox isolation;
- P9 case counts;
- guarded release gates;
- every broken Report/Sandbox specialist metric;
- Eval scope injection rejection.

Web:

```text
web/test/p9-client.test.ts
web/test/p9-pages.test.tsx
web/test/app-shell.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes:

- Report grant request payload;
- Sandbox request payload allowlist;
- P9 Eval API paths;
- P9 management/eval route precedence;
- Report Center content;
- non-clickable artifactRef;
- no arbitrary SQL/Python input surface;
- required Sandbox diagnostics;
- XSS/active-content escaping;
- 18-digit ID rendering;
- all Report and Sandbox metric families;
- P9 Evaluation Overview.

---

## 15. Execution status

The P9 server test is included in `test:server`; Web tests use the existing `web/test` glob.

An execution attempt was made from the available container:

```text
git clone --depth 1 --branch feat/industry-report-sandbox-p9 https://github.com/leoszw/pi-web.git
```

It failed before repository access:

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

Current verification state:

```text
implementation complete
+ regression tests authored
+ two static review rounds complete
+ command execution blocked by environment DNS
```

---

## 16. P9 result

| Requirement | Result |
| --- | --- |
| Report list / preview / metadata | PASS (implementation/static review) |
| Report evidence / lineage | PASS |
| Authorized download boundary | PASS |
| Report active-content safety coverage | PASS |
| Report Eval 10 specialist cases | PASS |
| Sandbox Goal / Schema / SQL / validation / queryId UI | PASS |
| Broker policies / Python hash / attestation / output / lineage | PASS |
| No arbitrary SQL console | PASS |
| Write SQL / SELECT * / LOAD_FILE / system-schema rejection | PASS |
| Python import/open/network/process safety | PASS |
| Dynamic queryId safety | PASS |
| Actual row / byte / timeout budget enforcement | PASS |
| Sandbox Eval 8 specialist cases | PASS |
| Trusted project/scope boundary | PASS |
| 18-digit ID string preservation | PASS |
| Two static review rounds | PASS |
| Actual typecheck/test/build execution | BLOCKED BY ENVIRONMENT |

P9 is ready to hand off to P10 Runtime / Adapter + Operations after command-level verification becomes available.
