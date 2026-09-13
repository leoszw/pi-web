# P6 Knowledge / RAG + RAG Eval DoD Review

## Scope

P6 is implemented on `feat/industry-rag-p6`, starting from the P5 close commit:

```text
54ed6f721a6c1bde18b7b5ac3f30b2ff5628ae2a
```

This phase is deliberately mock-backed. It does **not** connect:

- Object Storage;
- OpenSearch / vector infrastructure;
- a production parser/embedding service;
- a real LLM;
- MySQL DML.

The mock implementation exists to establish the management, ACL, ingestion, retrieval-eval, answer-eval, and citation contracts before production adapters are connected.

---

## 1. Knowledge API

Implemented under the Industry BFF namespace:

```text
GET  /api/industry/v1/knowledge/options
GET  /api/industry/v1/knowledge/documents
POST /api/industry/v1/knowledge/uploads
GET  /api/industry/v1/knowledge/documents/:id
POST /api/industry/v1/knowledge/documents/:id/reingest
GET  /api/industry/v1/knowledge/documents/:id/chunks
GET  /api/industry/v1/knowledge/ingestions/:id
```

`/knowledge/options` is an additional P6 helper endpoint. It provides the only values that the browser may present for Industry / Company / Project / Department / Visibility / ACL Users / ACL Roles / Security Tags.

All knowledge resources are still resolved against server-side `TrustedRequestContext`.

### Permissions

```text
knowledge.read
knowledge.upload
knowledge.reingest
knowledge.admin
```

The browser cannot upgrade these permissions.

---

## 2. Trusted scope and ACL boundary

The upload UI receives candidate values from `/knowledge/options`.

The mock options are generated from trusted context:

- active company;
- active project;
- authenticated user;
- authenticated roles;
- server-defined industry / department / security-tag dictionaries.

This is only a UI convenience boundary. The BFF independently revalidates every submitted value.

The upload request has a strict body whitelist:

```text
fileName
mimeType
sizeBytes
industry
companyId
projectId
department
visibility
aclUsers
aclRoles
securityTags
```

Unexpected fields such as `tenantId`, `userId`, or other injected trusted scope are rejected.

A valid-looking but unauthorized project, user, role, or security tag is rejected with:

```text
KNOWLEDGE_SCOPE_NOT_ALLOWED
```

`RESTRICTED` documents require at least one allowed ACL user or role.

Cross-project document IDs are returned as `KNOWLEDGE_DOCUMENT_NOT_FOUND`, preventing enumeration of inaccessible project resources.

Seed documents now use the trusted project's company instead of assuming a fixed `company-1`.

---

## 3. Mock upload interaction

The Knowledge page provides a browser File Picker for:

```text
.pdf
.txt
.docx
```

P6 intentionally reads only local file metadata:

- file name;
- MIME type;
- size.

The actual file bytes are not sent to the BFF and are not stored anywhere in P6.

The API contract therefore remains a deterministic metadata fixture contract until the real object-storage adapter is introduced.

The server enforces a mock maximum size of 20 MiB and an explicit MIME allowlist.

---

## 4. Ingestion pipeline

The deterministic mock exposes the full planned pipeline:

```text
RECEIVED
VALIDATING
STORED
PARSING
EXTRACTING
CHUNKING
ENRICHING
EMBEDDING
INDEXING
QUALITY_VALIDATING
READY
```

`FAILED` remains part of the shared state contract for the production adapter / future fault fixtures.

Each ingestion includes:

- `ingestionId`;
- `documentId`;
- project;
- current status;
- source version;
- ordered step history;
- start/completion time.

Reingest creates a new ingestion and increments:

```text
source-v1 -> source-v2 -> ...
```

It does not mutate a production index or object store.

---

## 5. Knowledge chunks

The deterministic chunks expose:

- chunk ID;
- ordinal;
- text;
- parent context;
- page;
- section;
- source version;
- project;
- security tags.

The Knowledge Document Inspector shows page / section / parent context and source version so the same evidence fields can be reused by Citation Inspector.

---

## 6. Knowledge UI

Route:

```text
/industry/knowledge
```

The P6 management workspace includes:

- metadata-only File Picker;
- Industry selector;
- Company selector;
- Project selector;
- Department selector;
- Visibility selector;
- ACL Users;
- ACL Roles;
- Security Tags;
- document list;
- document detail;
- reingest action;
- ingestion pipeline;
- chunk browser.

The page explicitly states that Object Storage and OpenSearch are not connected.

The UI does not synthesize unauthorized scope choices.

---

## 7. RAG Eval contract

Dataset:

```text
rag-safety-v1
```

Deterministic variants:

```text
rag-broken-v0
rag-guarded-v1
```

Seed runs:

```text
run-rag-broken-v0
run-rag-guarded-v1
```

The dataset currently contains four critical cases:

1. technical evidence retrieval;
2. contract citation correctness;
3. insufficient-evidence behavior;
4. RELEASE_HOLDOUT cross-project ACL leakage.

The broken profile deliberately creates ranking, duplication, unsupported-claim, citation, insufficient-evidence, and cross-project ACL failures.

The guarded profile keeps all returned evidence inside the trusted project / ACL scope and passes all deterministic gates.

---

## 8. RAG Eval API

Implemented:

```text
GET  /api/industry/v1/eval/rag/cases
GET  /api/industry/v1/eval/rag/runs
POST /api/industry/v1/eval/rag/runs
GET  /api/industry/v1/eval/rag/runs/:runId
GET  /api/industry/v1/eval/rag/runs/:runId/observations
GET  /api/industry/v1/eval/rag/runs/:runId/failures
```

Uses the existing Evaluation permission model:

```text
eval.read
eval.run
eval.admin
```

Run creation accepts only:

```json
{
  "datasetId": "rag-safety-v1",
  "variantId": "rag-guarded-v1"
}
```

Project/user/tenant scope cannot be injected into the run request.

---

## 9. RAG Retrieval Eval metrics

Implemented:

- Recall@1;
- Recall@3;
- Recall@5;
- MRR;
- nDCG@5;
- document hit rate;
- chunk hit rate;
- duplicate rate;
- ACL leakage rate.

### Metric denominator correction from review

Retrieval metrics are calculated only over cases that actually have expected evidence.

Insufficient-evidence / no-evidence cases are **not** counted as perfect Recall/MRR/nDCG samples.

This prevents adding more negative/no-evidence cases from artificially inflating retrieval quality.

`ACL leakage` is evaluated directly against the trusted active `projectId` and each chunk's server-projected ACL decision:

```text
chunk.projectId !== trustedProjectId
OR
chunk.aclAllowed === false
```

ACL leakage is a deterministic release gate.

---

## 10. RAG Answer Eval metrics

Implemented:

- Groundedness;
- Citation Correctness;
- Citation Completeness;
- Answer Relevance;
- Unsupported Claim Rate;
- Insufficient Evidence Correctness.

Insufficient Evidence Correctness is calculated only over the no-evidence subset.

Unsafe unsupported claims, citation failures, and insufficient-evidence regressions cause Release Gate failure.

---

## 11. Citation Inspector

Routes:

```text
/industry/eval/rag
/industry/eval/runs/:runId/rag
```

Citation Inspector exposes the complete evidence chain for one eval case:

```text
Question
Expected Evidence
Retrieved Chunks
Parent Context
Page / Section
Source Version
ACL decision
Answer
Claim -> Citation
Supported / Unsupported
Trace ID
```

This makes retrieval and answer failures inspectable in one surface without mixing them with Knowledge management operations.

---

## 12. Deterministic Release Gate

RAG Release Gate fails when any of these deterministic safety/quality rules regress:

- ACL leakage > 0;
- Recall@3 below the fixture gate;
- duplicate chunks present;
- groundedness below the fixture gate;
- citation correctness/completeness below the fixture gate;
- unsupported claims present;
- insufficient-evidence handling incorrect.

ACL leakage is not averaged away by the other answer metrics.

---

## 13. Tests added

Server:

```text
server/test/knowledge-router.test.ts
server/test/rag-eval-router.test.ts
```

Coverage includes:

- Knowledge permissions;
- active-project requirement;
- server-issued scope/ACL candidates;
- request-field injection rejection;
- unauthorized project/role rejection;
- RESTRICTED visibility;
- cross-project hiding;
- upload metadata;
- full ingestion pipeline;
- chunks and source versions;
- reingest version increment;
- RAG Eval permissions;
- RAG run scope injection rejection;
- guarded Release Gate PASS contract;
- deterministic ACL leakage;
- broken failure drilldown;
- evidence-specific Recall@3 denominator;
- no-evidence-specific Insufficient Evidence denominator;
- project isolation.

Web:

```text
web/test/knowledge-client.test.ts
web/test/knowledge-page.test.tsx
web/test/rag-eval-client.test.ts
web/test/rag-eval.test.tsx
web/test/app-shell.test.tsx
web/test/eval-overview.test.tsx
```

Coverage includes:

- same-origin Knowledge client;
- encoded document/ingestion IDs;
- no tenant/user/approval-token injection;
- metadata-only File Picker;
- authorized scope choices only;
- pipeline/chunk/source-version rendering;
- RAG client request contract;
- RAG route/result route;
- broken/guarded Release Gate surfaces;
- Citation Inspector evidence chain.

The server test script includes the new P6 server suites.

---

## 14. Review round 1

Review focused on trusted ACL boundary and strict contracts.

Findings/fixes:

1. Confirmed upload choices alone are not trusted; the BFF revalidates all scope/ACL values.
2. Confirmed run creation rejects project scope injection.
3. Reworked ACL leakage to be treated as a deterministic safety finding.
4. Removed an `any` from the ingestion UI fixture and retained strict `KnowledgeIngestionStatus` typing.
5. Verified RAG and Trace Eval subrouters run before the generic Eval router.

---

## 15. Review round 2

Review focused on metric correctness and mock fidelity.

Findings/fixes:

1. Retrieval metric denominators originally included no-evidence cases and could inflate Recall/MRR/nDCG. They now use evidence-bearing cases only.
2. Insufficient Evidence Correctness now uses only no-evidence cases.
3. ACL leakage now compares each retrieved chunk directly to the trusted active project plus `aclAllowed`.
4. The broken ACL fixture now always selects a foreign project relative to the active project.
5. Knowledge seed data no longer assumes `company-1`; it is seeded with the trusted active company.
6. Added the metadata-only browser File Picker so the management surface behaves like an upload workflow without pretending P6 stores bytes.
7. Added regression assertions locking the corrected metric denominators.

No P7 Semantic / Entity / Tool / Memory evaluation functionality was introduced during P6.

---

## 16. Execution limitation

An actual repository execution was attempted with:

```text
git clone --depth 1 --branch feat/industry-rag-p6 ...
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

The isolated execution environment failed at clone time because `github.com` could not be resolved.

Therefore this review does **not** claim that typecheck/tests/build were executed successfully.

What is complete:

- implementation;
- test definitions;
- test script registration;
- two static review rounds;
- security / metric fixes found during those reviews.

---

## 17. P6 DoD conclusion

Planned P6 DoD:

- RAG management UI complete;
- ACL does not trust frontend input;
- RAG Eval supports drilldown;
- ACL leakage is deterministic;
- fixture/mock is used before Object Storage/OpenSearch;
- two review rounds.

Code-level/static-review conclusion:

```text
P6 IMPLEMENTATION COMPLETE
P6 STATIC REVIEW COMPLETE
P6 EXECUTION VALIDATION PENDING EXECUTABLE REPOSITORY ENVIRONMENT
```
