# PI Web Industry Agent 实施计划 v1.0

日期：2026-09-12  
目标项目：`leoszw/pi-web`  
实施依据：

- `docs/plans/2026-09-12-industry-agent-control-plane-design.md`
- `docs/design-docs/PI_Web_Industry_Agent_评测平台设计与实施规划_v1.0.md`

关联执行内核：

- `leoszw/pi/packages/industry-agent`
- `leoszw/pi/evals/industry-agent/*`

文档性质：**可执行实施计划**。  
数据库状态：**NOT AUTHORIZED / NOT EXECUTED**。除非后续明确获得 `DB_CONNECT_APPROVAL` / `DB_EXECUTION_APPROVAL`，本计划不得连接或执行 MySQL。

---

# 1. 实施目标

本计划的目标不是在 `pi-web` 中重新实现 Industry Agent，而是把现有 `pi` 中已经完成的 Industry Agent 能力产品化为：

```text
Interaction Plane
+ Management / Control Plane
+ Evaluation Workbench
+ Trusted Confirmation UI
+ Operations / Release Qualification UI
```

最终形成：

```text
Browser
  -> pi-web Web
  -> pi-web Server / BFF
  -> pi Industry Agent API
  -> approved adapters / infrastructure
```

其中：

```text
pi
  = Execution / Policy Plane
  = 领域逻辑、安全策略、评测口径、Mutation Runtime、RAG ACL、Release Gate

pi-web
  = Interaction / Management Plane
  = 用户交互、管理、可视化、可信确认、评测操作、错误分析、发布控制
```

---

# 2. 实施总原则

## 2.1 不重复实现领域规则

`pi-web` 禁止复制实现：

- Scope policy；
- Mutation digest；
- Approval Token 校验；
- RAG ACL；
- Retrieval scoring；
- Release Gate metric；
- Sandbox SQL/Python policy；
- Report active-content policy。

这些必须来自 `pi`。

## 2.2 浏览器永远不是可信执行环境

浏览器不得直接持有：

- MySQL / OpenSearch credential；
- Object Storage credential；
- Model API Key；
- Approval Token；
- Sandbox credential；
- DB DSN；
- 服务端 roles/permissions 真值。

浏览器选择的 `projectId` 只是用户选择意图，真正的 `RequestContext` 必须由 BFF 服务端生成。

## 2.3 评测从早期进入开发流程

评测不是最后阶段再补。

实施时必须尽早完成：

```text
Intent Lab
Retrieval Lab
```

并在后续功能阶段持续增加对应 Eval。

## 2.4 每阶段必须可独立验收

统一节奏：

```text
实现
 -> 定向测试
 -> 类型检查
 -> 自审
 -> 安全审查
 -> 修正
 -> 再审
 -> 净 diff
 -> 提交
 -> 阶段验收
 -> 停止
```

不得一次跨多个阶段实现。

## 2.5 DB 边界

当前允许：

- API/Port/Repository 设计；
- InMemory / File-backed Adapter；
- Mock；
- fixture；
- SQL 文件静态生成与审查；
- rollout 方案。

当前禁止：

- 连接 MySQL；
- Testcontainers MySQL；
- 执行 migration；
- DDL；
- DML；
- 真实 Mutation Commit。

---

# 3. 当前仓库基线

当前 `pi-web` 已有：

```text
server/src/
  bridge.ts
  main.ts
  models-config.ts
  rpc-client.ts
  static.ts

shared/
  protocol.ts

web/src/
  App.tsx
  store.ts
  ws-client.ts
  components/*
```

当前特点：

- React 18 + Vite；
- Node + TS + `ws`；
- `/ws` 负责 Coding Agent RPC；
- 每个 WS 连接 spawn 一个 `pi --mode rpc` 子进程；
- 当前主要是 localhost 单用户工具；
- 现有 Model Config 结构存在 `apiKey`；
- 尚无完整 Control Plane 认证、Scope、RBAC、管理路由；
- 当前没有 Industry Agent BFF。

实施必须渐进改造，不能破坏现有 `/ws` Coding Agent Chat。

---

# 4. 目标目录结构

建议逐步演进为：

```text
pi-web/
├── shared/
│   ├── protocol.ts
│   └── industry/
│       ├── common.ts
│       ├── api.ts
│       ├── events.ts
│       ├── ui-actions.ts
│       └── eval/
│           ├── common.ts
│           ├── datasets.ts
│           ├── runs.ts
│           ├── metrics.ts
│           └── events.ts
│
├── server/src/
│   ├── main.ts
│   ├── coding/
│   │   ├── bridge.ts
│   │   └── rpc-client.ts
│   ├── industry/
│   │   ├── router.ts
│   │   ├── auth.ts
│   │   ├── context.ts
│   │   ├── event-gateway.ts
│   │   ├── clients/
│   │   │   ├── industry-agent-client.ts
│   │   │   └── mock-industry-agent-client.ts
│   │   └── routes/
│   │       ├── context.ts
│   │       ├── health.ts
│   │       ├── conversations.ts
│   │       ├── mutations.ts
│   │       ├── knowledge.ts
│   │       ├── traces.ts
│   │       ├── retrieval.ts
│   │       ├── reports.ts
│   │       ├── sandbox.ts
│   │       ├── runtime.ts
│   │       ├── operations.ts
│   │       └── eval/
│   │           ├── datasets.ts
│   │           ├── runs.ts
│   │           ├── compare.ts
│   │           ├── baselines.ts
│   │           ├── gate.ts
│   │           ├── reviews.ts
│   │           └── playground.ts
│   └── security/
│       ├── csrf.ts
│       ├── origin.ts
│       ├── redaction.ts
│       ├── rate-limit.ts
│       └── request-limits.ts
│
└── web/src/
    ├── app/
    │   ├── App.tsx
    │   ├── AppShell.tsx
    │   └── routes.tsx
    ├── api/
    │   ├── http-client.ts
    │   ├── industry-client.ts
    │   └── event-client.ts
    ├── auth/
    │   ├── principal.ts
    │   └── guards.tsx
    ├── features/
    │   ├── coding-chat/
    │   ├── industry-workspace/
    │   ├── mutations/
    │   ├── knowledge/
    │   ├── traces/
    │   ├── retrieval/
    │   ├── eval/
    │   ├── reports/
    │   ├── sandbox/
    │   ├── runtime/
    │   └── operations/
    └── components/
        ├── ui/
        ├── ui-actions/
        ├── data-table/
        └── json-viewer/
```

---

# 5. 分阶段实施总览

| 阶段 | 名称 | 核心结果 |
|---|---|---|
| P0 | Control Plane 安全基线 | AppShell、Industry BFF、Scope、Secret 边界、Mock Client |
| P1 | Eval 基础框架 + Intent Lab | Dataset/Run/Observation、Intent Playground、F1/Confusion |
| P2 | Retrieval Lab | Engineering/BOQ、Exact/BM25/Dense/RRF/Rerank、A/B |
| P3 | Industry Workspace + UIAction | 主业务工作台、流式事件、Table/Picker/Form/Citation |
| P4 | Mutation Center | Diff、Trusted Confirm、Conflict、Reconciliation |
| P5 | Trace/Audit + Retrieval Debug | Timeline、Span Tree、Token/Cost、单次 Retrieval Debug |
| P6 | Knowledge/RAG + RAG Eval | Upload/ACL/Ingestion/Chunk/Citation + RAG Retrieval/Answer Eval |
| P7 | Semantic/Entity/Tool/Memory Eval | 专项评测工具补齐 |
| P8 | Multimodal + Agent Loop 管理与 Eval | 图片、Observation、Agent Loop、安全与预算评测 |
| P9 | Report + Sandbox 管理与 Eval | Artifact、Lineage、Sandbox Run、静态安全评测 |
| P10 | Runtime/Adapter + Operations | Adapter health、配置版本、资格状态 |
| P11 | Unified Benchmark + Release Gate | 1030 Corpus、M9–M12、Baseline/Compare/Gate |
| P12 | Online Quality Feedback Loop | 线上质量观察、Trace→Draft Eval、Drift |

---

# 6. P0：Control Plane 安全基线

## 6.1 目标

在不接真实 Industry Agent 基础设施的情况下，先建立正确的 Web/BFF/安全骨架。

## 6.2 必做内容

### P0-T1：AppShell

新增：

```text
web/src/app/AppShell.tsx
web/src/app/routes.tsx
```

实现：

```text
/chat
/industry
```

要求：

- 现有 Coding Chat 行为不回归；
- Industry 页面先显示空 Dashboard；
- URL 刷新可恢复。

### P0-T2：保留 `/ws` Coding RPC

将当前 Coding Agent 相关代码逐步归档到：

```text
server/src/coding/
web/src/features/coding-chat/
```

但第一步可以只做 re-export / wrapper，避免大范围重构。

### P0-T3：Industry Shared Contract

创建：

```text
shared/industry/common.ts
shared/industry/api.ts
shared/industry/events.ts
shared/industry/ui-actions.ts
```

定义：

- `industry-api-v1`
- `industry-event-v1`
- `ui-action-v1`
- `IndustryApiError`
- `IndustryEventEnvelope`

### P0-T4：AuthPrincipal

创建 server-side：

```ts
interface AuthPrincipal {
  subject: string
  userId: string
  tenantId: string
  companyIds: readonly string[]
  roles: readonly string[]
  permissions: readonly string[]
  sessionId: string
}
```

Phase 0 使用：

```text
MockPrincipalProvider
```

不接真实 SSO。

### P0-T5：Server-side RequestContext

浏览器只允许发送：

```text
selectedProjectId
```

BFF 根据 Principal + authorized projects 构建可信 RequestContext。

测试必须证明：

- client tenantId 被忽略/拒绝；
- client userId 被忽略/拒绝；
- client role 被忽略/拒绝；
- unauthorized project 被拒绝。

### P0-T6：IndustryAgentClient Port

```ts
interface IndustryAgentClient {
  getHealth(...)
  getContext(...)
}
```

先实现：

```text
MockIndustryAgentClient
```

禁止直接 import `pi/packages/industry-agent/src/**` 内部源码。

### P0-T7：BFF Router

实现：

```text
GET /api/industry/v1/health
GET /api/industry/v1/context
POST /api/industry/v1/context/project
```

### P0-T8：local/control-plane mode

支持：

```text
PI_WEB_MODE=local
PI_WEB_MODE=control-plane
```

`local`：

- 保持现有功能；
- localhost；
- 当前 ModelConfig 行为。

`control-plane`：

- 使用 Principal；
- 禁止明文 Secret；
- Industry API 开启。

### P0-T9：Secret Masking

Control-plane 模式下现有 `apiKey` 不允许回传浏览器。

引入：

```ts
interface SecretRef {
  configured: boolean
  source: 'env' | 'vault' | 'secret-manager'
  reference?: string
  lastUpdatedAt?: string
}
```

### P0-T10：基础安全中间件

最少实现：

- Origin allowlist；
- JSON body limit；
- upload size placeholder；
- log redaction；
- requestId；
- error mapping。

## 6.3 测试

新增：

```text
server/test/industry-context.test.ts
server/test/industry-auth.test.ts
server/test/industry-secret-redaction.test.ts
web/test/app-shell.test.tsx
web/test/industry-dashboard.test.tsx
```

必须验证：

- `/chat` 不回归；
- `/industry` 可打开；
- Scope 不信任浏览器；
- control-plane 不返回 apiKey；
- Approval Token 类型根本不在 web contract 中。

## 6.4 DoD

P0 只有全部满足才 PASS：

- typecheck；
- server tests；
- web tests；
- existing Coding Chat tests；
- Scope tests；
- Secret tests；
- 无 DB/OpenSearch 连接；
- 无真实 Mutation；
- 两轮自审。

---

# 7. P1：Eval 基础框架 + Intent Lab

## 7.1 目标

评测平台尽早成为真实研发工具。

## 7.2 Shared Eval Contract

新增：

```text
shared/industry/eval/
  common.ts
  datasets.ts
  runs.ts
  metrics.ts
  events.ts
```

统一定义：

- EvalDataset；
- EvalCase；
- EvalRun；
- EvalObservation；
- EvalComparison；
- ComponentVersionSnapshot。

版本：

```text
eval-api-v1
eval-event-v1
eval-case-v1
eval-observation-v1
```

## 7.3 EvaluationClient

BFF 定义：

```ts
interface EvaluationClient {
  listDatasets(...)
  getDataset(...)
  listCases(...)
  createRun(...)
  getRun(...)
  getObservations(...)
  compareRuns(...)
}
```

Phase 1 使用 Mock/File-backed 实现。

## 7.4 Intent Dataset

支持：

- Dataset List；
- Dataset Detail；
- Case List；
- Case Detail；
- Draft / Reviewed；
- tag；
- difficulty；
- critical；
- label history。

## 7.5 Intent Playground

路由：

```text
/industry/eval/playground/intent
```

输入：

- query；
- previous turns；
- active project；
- prompt/model/parser version。

输出：

- primary intent；
- candidate intents；
- confidence；
- SemanticFrame；
- version；
- trace placeholder。

支持：

```text
Save as Eval Case
Mark as Hard Case
```

## 7.6 Intent Batch Run

支持：

- run creation；
- queued/running/completed；
- per-case result；
- failed cases。

正式指标由 `pi` 返回。

Phase 1 mock 可以生成 fixture metric，但 UI 不自己重算正式口径。

## 7.7 Intent Metrics UI

至少：

- Accuracy；
- Macro F1；
- Micro F1；
- Per-intent P/R/F1；
- Top-K Recall；
- Confusion Matrix；
- Wrong Mutation Intent Rate；
- Hard-case Accuracy。

## 7.8 Failure Explorer

过滤：

- expected intent；
- actual intent；
- context/no-context；
- tag；
- confidence；
- prompt/model/parser version。

## 7.9 测试

必须覆盖：

- case schema；
- context-dependent case；
- 18-digit ID string；
- confusion data display；
- wrong mutation intent highlight；
- save-as-case；
- unreviewed dataset 不能成为 baseline。

## 7.10 DoD

- Eval 一级导航可用；
- Intent Lab 可完整跑 mock dataset；
- Case Drilldown 可用；
- Failure filter 可用；
- 无 DB；
- 无真实模型调用；
- 两轮审查。

---

# 8. P2：Retrieval Lab

## 8.1 目标

建立 Engineering / BOQ 的完整 Hybrid Retrieval 评测工作台。

## 8.2 页面

```text
/industry/eval/playground/retrieval
/industry/eval/runs/:runId/retrieval
```

## 8.3 分层展示

必须展示：

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

不能只展示最终 Top10。

## 8.4 Candidate 字段

至少：

```text
entityId
name
rank
sourceArm
exactScore
bm25Score
denseScore
rrfScore
rerankScore
businessScore
finalScore
reason
```

## 8.5 Engineering Case

支持：

- chainage；
- alignment；
- unit/category/type；
- hierarchy；
- hard negative。

## 8.6 BOQ Case

支持：

- code；
- specification；
- concrete grade；
- diameter；
- thickness；
- percentage；
- hard negative。

## 8.7 指标

至少：

- Recall@1/5/10/20/50；
- Hit@1；
- MRR；
- MAP；
- nDCG@K；
- Zero Result Rate；
- Cross-project leakage；
- Cross-alignment conflict；
- Critical Spec Conflict；
- Wrong Entity High-confidence Rate。

## 8.8 A/B Compare

支持：

```text
Embedding A vs B
Reranker A vs B
Config A vs B
```

展示：

- rank movement；
- score movement；
- improved/regressed cases。

## 8.9 Statistical View

增加：

- paired win/loss/tie；
- bootstrap CI；
- minimum sample warning；
- INCONCLUSIVE。

安全指标仍然 deterministic，不做“统计上差不多”。

## 8.10 Dataset Leakage Check

实现：

- exact duplicate；
- normalized duplicate；
- near duplicate；
- same-source duplicate；
- DEV/REGRESSION/RELEASE_HOLDOUT split。

## 8.11 DoD

- Engineering/BOQ Retrieval Lab 可用；
- Exact/BM25/Dense/RRF/Rerank 可逐层查看；
- A/B compare 可用；
- Hard Negative 可定位；
- Case Drilldown 可跳失败分析；
- 不接真实 OpenSearch 前使用 fixture/mock；
- 两轮审查。

---

# 9. P3：Industry Workspace + UIAction

## 9.1 目标

形成普通业务用户主工作台。

## 9.2 Conversation API

BFF：

```text
POST /api/industry/v1/conversations
GET  /api/industry/v1/conversations/:id
POST /api/industry/v1/conversations/:id/messages
POST /api/industry/v1/conversations/:id/abort
GET  /api/industry/v1/conversations/:id/events
```

Phase 3 可继续 Mock client。

## 9.3 Event Gateway

实现：

```ts
interface IndustryEventEnvelope<T> {
  schemaVersion: 'industry-event-v1'
  eventId: string
  sequenceNo: number
  traceId: string
  requestId: string
  conversationId?: string
  type: string
  timestamp: string
  payload: T
}
```

要求：

- reconnect；
- `afterSequenceNo`；
- eventId 去重；
- unknown event 安全忽略。

## 9.4 Workspace UI

三栏：

```text
Project Context
Conversation
Context Inspector
```

支持：

- project；
- conversation；
- Tool Card；
- Citation；
- Working Memory；
- Trace link；
- image upload placeholder；
- export placeholder。

## 9.5 UIAction Registry

实现：

- entity_picker；
- form；
- editable_form；
- table；
- multi_select；
- date_picker；
- diff；
- mutation_confirmation；
- report_preview；
- error_resolution。

## 9.6 DataTable

必须：

- server pagination；
- sort allowlist；
- filter allowlist；
- stable cursor；
- row selection；
- ID string；
- export snapshot reference。

## 9.7 DoD

- Workspace 能完成 mock end-to-end；
- Event reconnect 可恢复；
- UIAction 渲染齐全；
- raw HTML 禁止；
- 18 位 ID 不丢精度；
- 两轮审查。

---

# 10. P4：Mutation Center

## 10.1 目标

建立可信的写操作确认面。

## 10.2 API

```text
GET  /api/industry/v1/mutations
GET  /api/industry/v1/mutations/:operationId
POST /api/industry/v1/mutations/:operationId/confirm
POST /api/industry/v1/mutations/:operationId/reject
GET  /api/industry/v1/mutations/:operationId/audit
GET  /api/industry/v1/mutations/reconciliation
```

## 10.3 Confirm Contract

浏览器只发送：

```json
{
  "digest": "...",
  "explicitConfirmation": true
}
```

不发送 Approval Token。

BFF 内部：

```text
approve -> commit
```

## 10.4 Idempotency

Confirm 必须使用：

```text
Idempotency-Key
```

超时后：

```text
先查询 operation 状态
禁止自动 retry commit
```

## 10.5 特殊状态

必须处理：

- VERSION_CONFLICT；
- DIGEST_MISMATCH；
- ACCESS_DENIED；
- APPROVAL_REPLAY；
- `MUTATION_COMMIT_FINALIZATION_FAILED`。

Finalization failure UI：

```text
业务写可能已成功
禁止重试
进入 reconciliation
```

## 10.6 Eval 同步补充

在 P4 同时补 Mutation Eval：

- wrong target；
- scope leakage；
- confirmation bypass；
- digest mismatch；
- replay；
- version conflict；
- finalization/reconciliation fault injection。

## 10.7 DoD

- 浏览器从未拿到 Approval Token；
- mock confirmation 流程完整；
- conflict/finalization 错误态正确；
- unsafe retry 不存在；
- Mutation Eval 页面/结果可查看；
- 不执行真实 DML；
- 两轮安全审查。

---

# 11. P5：Trace / Audit + Retrieval Debug

## 11.1 Trace API

```text
GET /traces
GET /traces/:traceId
GET /traces/:traceId/timeline
GET /traces/:traceId/tree
GET /traces/:traceId/stats
```

## 11.2 Trace 页面

Tab：

- Overview；
- Timeline；
- Span Tree；
- Raw/Debug。

## 11.3 权限

区分：

```text
trace.read.basic
trace.read.debug
trace.read.prompt
audit.read
```

## 11.4 双层脱敏

BFF redaction + Web JsonViewer masking。

禁止展示：

- API Key；
- Cookie；
- Authorization；
- Approval Token；
- DB DSN。

## 11.5 Retrieval Debug

与 Retrieval Eval 区分：

```text
Debug = 单次问题排查
Eval  = Dataset + Batch + Metric + Compare
```

Debug 页面展示单次完整候选链。

## 11.6 Trace/Token Eval

补充：

- trace completeness；
- sequence monotonic；
- token accounting consistency；
- tool audit completeness；
- redaction leak；
- query latency。

---

# 12. P6：Knowledge/RAG + RAG Eval

## 12.1 Knowledge API

```text
GET  /knowledge/documents
POST /knowledge/uploads
GET  /knowledge/documents/:id
POST /knowledge/documents/:id/reingest
GET  /knowledge/documents/:id/chunks
GET  /knowledge/ingestions/:id
```

## 12.2 Upload Form

显示/选择：

- Industry；
- Company；
- Project；
- Department；
- Visibility；
- ACL Users；
- ACL Roles；
- Security Tags。

所有候选项来自服务端授权范围。

## 12.3 Ingestion UI

状态：

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
FAILED
```

## 12.4 RAG Retrieval Eval

指标：

- Recall@K；
- MRR；
- nDCG；
- document/chunk hit；
- duplicate rate；
- ACL leakage。

## 12.5 RAG Answer Eval

指标：

- Groundedness；
- Citation Correctness；
- Citation Completeness；
- Answer Relevance；
- Unsupported Claim；
- Insufficient Evidence correctness。

## 12.6 Citation Inspector

展示：

```text
Question
Expected Evidence
Retrieved Chunks
Parent Context
Answer
Claim -> Citation
Page / Section / Source Version
```

## 12.7 DoD

- RAG 管理 UI 完整；
- ACL 不信任前端；
- RAG Eval 可 drilldown；
- ACL leakage deterministic；
- 不接真实 Object Storage/OpenSearch 前使用 mock；
- 两轮审查。

---

# 13. P7：Semantic / Entity / Tool / Memory Eval

## 13.1 Normalization Lab

覆盖：

- chainage；
- range；
- alignment；
- side；
- unit；
- BOQ code；
- date；
- specification；
- abbreviation。

## 13.2 Entity Lab

展示失败阶段：

```text
Mention
Candidate Generation
Ranking
Scope
Ambiguity
```

## 13.3 Tool Eval

指标：

- selection accuracy；
- argument exact；
- missing required；
- unknown argument；
- scope injection blocked；
- unnecessary tool；
- tool sequence。

## 13.4 Memory Eval

覆盖：

```text
这些
那些
刚才那些
第二个
只看未完成的
继续
把这些导出来
```

并检查 project isolation / TTL / source policy。

## 13.5 DoD

- 四类专项 Eval 都有 Case/Run/Failure drilldown；
- 可从 Trace “Add to Eval” 生成 Draft；
- Draft 不自动进入 Golden；
- 两轮审查。

---

# 14. P8：Multimodal + Agent Loop 管理与 Eval

## 14.1 图片输入 UI

支持：

- upload；
- preview；
- Observation；
- bbox；
- low confidence；
- entity review；
- missing fields。

## 14.2 Multimodal Eval

指标：

- observation precision/recall；
- field extraction；
- entity match；
- no-evidence reject；
- prompt injection block；
- wrong-target rate。

## 14.3 Agent Loop Run

展示：

```text
Plan
Act
Verify
Replan
Terminate
```

以及：

- steps；
- tools；
- token；
- cost；
- budgets；
- timeout；
- termination reason。

## 14.4 Agent Loop Eval

覆盖：

- success；
- replan；
- max step；
- max tool；
- token/cost；
- timeout；
- usage incomplete；
- scope injection；
- critical tool。

---

# 15. P9：Report + Sandbox 管理与 Eval

## 15.1 Report Center

支持：

- list；
- preview；
- metadata；
- evidence；
- lineage；
- authorized download。

## 15.2 Report Eval

检查：

- hidden field；
- evidence coverage；
- active content；
- external links；
- XLSX macro；
- PDF action；
- SVG script；
- path traversal；
- size；
- timeout。

## 15.3 Sandbox UI

展示：

- Goal；
- Schema；
- generated SQL；
- validation；
- queryId；
- Broker policies；
- Python source/hash；
- runtime attestation；
- output；
- lineage。

禁止提供 arbitrary SQL console。

## 15.4 Sandbox Eval

覆盖：

- write SQL reject；
- `SELECT *`；
- `LOAD_FILE`；
- system schema；
- import/open/network/process；
- dynamic queryId；
- attestation；
- payload/budget。

---

# 16. P10：Runtime / Adapter + Operations

## 16.1 Runtime 页面

展示：

- Agent model；
- Embedding；
- Reranker；
- OpenSearch；
- Parser；
- Object Storage；
- Multimodal；
- Renderer；
- Sandbox；
- Trace/Audit。

每项：

```text
Adapter
Endpoint alias
Configured
Health
Version
Last Check
Secret Source
```

## 16.2 Config Draft Flow

```text
Draft
 -> Validate
 -> Diff
 -> Save
 -> version bump
 -> Eval
 -> eligible for promote
```

## 16.3 Operations

展示：

- CI；
- adapter readiness；
- staging infra；
- trace/audit；
- eval gate；
- E2E；
- renderer；
- sandbox；
- DB approval；
- production approval。

---

# 17. P11：Unified Benchmark + Release Gate

## 17.1 接入 Phase 11 Corpus

必须支持：

- 1030 Golden/Hard；
- manifest；
- fingerprint；
- full coverage；
- critical E2E。

## 17.2 接入 M9–M12 Eval

统一纳入：

- multimodal；
- agent loop；
- report；
- sandbox。

## 17.3 Baseline

Baseline 必须显式 Accept。

要求：

- run complete；
- coverage 100%；
- dataset reviewed；
- critical E2E pass；
- gate pass；
- reproducibility complete。

## 17.4 Compare

展示：

- metric delta；
- regression threshold；
- improved/regressed cases；
- version diff；
- rank movement；
- statistical CI。

## 17.5 Release Gate

前端只展示 `pi` 的 Gate 结果。

不允许：

```text
Manual PASS
```

例外使用独立 Waiver。

---

# 18. P12：Online Quality Feedback Loop

## 18.1 Online Dashboard

监控：

- intent drift；
- clarification；
- zero retrieval；
- low confidence；
- tool error；
- mutation reject；
- RAG insufficient evidence；
- latency；
- token/cost；
- user correction。

## 18.2 Trace -> Draft Eval

流程：

```text
Trace
 -> sanitize
 -> Draft Case
 -> Human Label
 -> Review
 -> Dataset Version
```

不能自动变 Golden。

## 18.3 Dataset Health

展示：

- Reviewed %；
- hard/adversarial；
- tag distribution；
- duplicate；
- near duplicate；
- holdout leakage；
- label churn；
- last review age。

---

# 19. 跨阶段公共能力

以下能力不得每阶段各做一套。

## 19.1 Server-side Pagination

统一 Cursor contract。

## 19.2 Error Contract

统一：

```ts
interface IndustryApiError {
  requestId: string
  traceId?: string
  code: string
  message: string
  retryable: boolean
  resolution?: {
    type:
      | 'refresh'
      | 'reauth'
      | 'reselect_project'
      | 'open_reconciliation'
      | 'contact_admin'
  }
}
```

## 19.3 Job Contract

Eval/RAG/Report/Sandbox：

```text
POST job
 -> jobId
 -> events
 -> REST terminal state
```

## 19.4 Event Resume

所有长任务：

- eventId；
- sequenceNo；
- afterSequenceNo；
- duplicate suppression。

## 19.5 Artifact Download

所有下载：

```text
authorize
 -> short-lived stream/url
```

Object key 不是授权。

## 19.6 Control Plane Audit

记录：

- project change；
- mutation confirm；
- RAG upload；
- eval started；
- baseline accepted；
- config promoted；
- report downloaded；
- sandbox started；
- reconciliation opened。

---

# 20. Cross-repo Contract 计划

`pi` 与 `pi-web` 必须保持版本化契约：

```text
industry-api-v1
industry-event-v1
ui-action-v1
eval-api-v1
eval-event-v1
eval-case-v1
eval-observation-v1
benchmark-report-v1
release-gate-report-v1
```

建议建立 contract fixture。

Breaking change 必须：

```text
new version
 -> contract test
 -> compatibility window
```

不能直接改字段语义。

---

# 21. 测试策略

## 21.1 每阶段都跑

```bash
npm run typecheck
npm run test:server
npm run test:web
npm run build
```

具体测试文件修改时运行对应定向测试。

## 21.2 Security Tests

必须持续覆盖：

- client scope spoof；
- secret leakage；
- approval token leakage；
- CSRF/origin；
- oversized request；
- XSS/raw HTML；
- unsafe download；
- mutation retry；
- arbitrary SQL；
- prompt injection as data。

## 21.3 Eval Tests

必须覆盖：

- dataset version；
- duplicate；
- baseline policy；
- holdout leakage；
- compare；
- failure disposition；
- gate display；
- critical case。

---

# 22. 提交与验收规则

每阶段：

```text
1. 读取相关设计
2. 实现
3. 定向测试
4. typecheck
5. 自审
6. 修复
7. 第二轮安全审查
8. 净 diff
9. commit
10. 验收
11. 停止
```

Commit 建议：

```text
feat: add industry control plane foundation
feat: add intent evaluation lab
feat: add retrieval evaluation lab
feat: add industry workspace
feat: add mutation review center
...
```

不要将多个大阶段压成一个 commit。

---

# 23. 阶段依赖关系

```text
P0
├─ P1 Eval Foundation
│   └─ P2 Retrieval Lab
├─ P3 Workspace
│   └─ P4 Mutation
├─ P5 Trace
└─ P6 RAG
    ↓
P7 Semantic/Tool/Memory Eval
P8 Multimodal/Agent Loop
P9 Report/Sandbox
P10 Runtime/Ops
    ↓
P11 Unified Benchmark/Gate
    ↓
P12 Online Quality
```

允许部分并行开发，但正式验收建议按顺序进行。

---

# 24. 禁止跨阶段事项

在对应阶段之前禁止：

- P0 前接真实 Industry Infra；
- P1 前做“只有总分”的 Eval Dashboard；
- P2 前把 Retrieval debug 当 Retrieval Eval；
- P4 前实现真实 commit 按钮；
- P6 前做真实 RAG ACL 编辑；
- P9 前做 SQL Console；
- P11 前把任意 Run 当正式 Baseline；
- P12 前自动把线上样本写 Golden。

---

# 25. 第一阶段实际执行清单

下一次开发只执行 **P0**。

具体任务：

- [ ] 创建 `shared/industry/common.ts`
- [ ] 创建 `shared/industry/api.ts`
- [ ] 创建 `shared/industry/events.ts`
- [ ] 创建 `shared/industry/ui-actions.ts`
- [ ] 新建 `web/src/app/AppShell.tsx`
- [ ] 引入 `/chat` / `/industry`
- [ ] 新建空 `IndustryDashboard`
- [ ] 创建 `server/src/industry/router.ts`
- [ ] 创建 `server/src/industry/auth.ts`
- [ ] 创建 `server/src/industry/context.ts`
- [ ] 定义 `IndustryAgentClient`
- [ ] 实现 `MockIndustryAgentClient`
- [ ] 实现 `/api/industry/v1/health`
- [ ] 实现 `/api/industry/v1/context`
- [ ] 实现 `/api/industry/v1/context/project`
- [ ] 实现 local/control-plane mode
- [ ] control-plane 模式隐藏真实 apiKey
- [ ] 增加 requestId / error contract
- [ ] 增加 Origin / request size 基础限制
- [ ] Scope spoof tests
- [ ] Secret leakage tests
- [ ] AppShell tests
- [ ] existing Coding Chat regression tests
- [ ] `npm run typecheck`
- [ ] `npm run test:server`
- [ ] `npm run test:web`
- [ ] `npm run build`
- [ ] 第一轮自审
- [ ] 修正
- [ ] 第二轮安全审查
- [ ] 净 diff
- [ ] commit
- [ ] P0 验收后停止

---

# 26. 第一轮计划审查：架构与依赖

审查重点：

- 是否把 `pi-web` 变成第二套 Agent Runtime；
- 是否让评测太晚进入开发；
- 是否存在前端可信 Scope；
- 是否泄露 Secret/Approval Token；
- 是否让 Workspace 和 Eval 互相阻塞；
- 是否出现 Report/Sandbox 过早实施。

结论与修正：

1. **评测必须提前**  
   原设计中的 Eval 若放到管理平台后半段，会导致开发早期缺少回归能力。  
   修正为 P1 Intent、P2 Retrieval，早于完整 Workspace。

2. **P0 不接真实基础设施**  
   使用 Mock `IndustryAgentClient`，先验证 Web/BFF 安全边界。

3. **Mutation 延后到 Workspace 之后**  
   Trusted UIAction 与 event contract 先稳定，再接 confirm。

4. **Retrieval Lab 与 Retrieval Debug 分离**  
   Lab 做 Dataset/Batch/Metric/A-B；Debug 做单 query。

第一轮结论：**PASS WITH FIXES**。

---

# 27. 第二轮计划审查：可实施性与安全

检查了：

```text
Control Plane
Intent Eval
Retrieval Eval
Workspace
Mutation
Trace
RAG
Tool/Memory
Multimodal
Agent Loop
Report
Sandbox
Runtime
Release Gate
Online Quality
```

修正：

1. **Baseline 不能自动取 latest**  
   P11 要求显式 Accept + Audit。

2. **Approval Token 永不进入 Browser**  
   P4 明确 server-side approve + commit。

3. **Secret 与 local mode 分离**  
   P0 开始即区分 local/control-plane。

4. **长任务统一 Job/Event**  
   避免 Eval/RAG/Report/Sandbox 各做一套长连接协议。

5. **安全指标 deterministic**  
   ACL、Mutation、SQL、Secret 不依赖 LLM Judge。

6. **Holdout 防泄漏**  
   P2 开始引入 DEV/REGRESSION/RELEASE_HOLDOUT。

7. **数据库授权不被 Web 开发绕过**  
   所有阶段默认 Mock/File/InMemory；真实 DB 另行审批。

第二轮结论：**PASS**。

---

# 28. 最终实施判定

本计划可以直接作为后续编码的阶段基线。

推荐严格按：

```text
P0
 -> P1
 -> P2
 -> P3
 -> ...
```

逐阶段实施。

其中必须优先保证：

```text
P1 Intent Lab
P2 Retrieval Lab
```

评测工具不能在功能开发完成后再补。

当前下一步：

> **只实施 P0：Control Plane 安全基线。**

P0 完成、测试、自审、修正、再审、提交、验收后停止，再进入 P1。

---

# 29. 数据库边界再次确认

截至本计划：

```text
MySQL connection        NOT AUTHORIZED
Migration execution     NOT AUTHORIZED
DDL execution           NOT AUTHORIZED
DML execution           NOT AUTHORIZED
Real mutation commit    NOT AUTHORIZED
```

P0–P2 应完全使用：

- Mock；
- fixture；
- InMemory；
- File-backed。

任何真实数据库接入必须等待后续单独授权。
