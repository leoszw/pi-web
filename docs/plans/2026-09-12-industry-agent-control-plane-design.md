# PI Web Industry Agent 操作与管理平台设计方案 v1.0

日期：2026-09-12  
目标项目：`leoszw/pi-web`  
关联执行内核：`leoszw/pi` 的 `packages/industry-agent`  
文档性质：架构设计 + UI/管理面设计 + 接口边界 + 分阶段实施计划  
数据库状态：**NOT AUTHORIZED / NOT EXECUTED**。本设计不授权连接或执行 MySQL。

---

# 1. 背景与设计结论

`pi` 仓库中的 Industry Agent 已完成 Phase 0–11 + M9–M12 的代码/协议层能力，包括：SemanticFrame / Normalizer、工程部位与 BOQ Hybrid Retrieval、READ Tools、Mutation Prepare / Diff / Confirmation / Approval / Commit、RAG Ingestion / QA、Working Memory、Golden/Hard Eval 与 Release Gate、图片输入、bounded Agent Loop、Report、只读 SQL/Python Sandbox、Trace / Token / Audit / Scope / ACL 等。

下一阶段不应该把这些领域能力重新实现一遍，而应该让 `pi-web` 成为这些能力的**操作面、管理面和可信确认面**。

核心结论：

> **`pi` 是执行内核和安全策略的最终裁决者；`pi-web` 是 Interaction Plane + Management/Control Plane。**

必须避免：

1. 在 React 前端重新实现权限、Scope、Mutation Digest、RAG ACL 等领域规则；
2. 让浏览器直接访问 MySQL、OpenSearch、Object Storage、模型 Provider、Sandbox Runtime；
3. 让浏览器自己声明可信的 `tenantId / userId / companyId / projectId`；
4. 把 `commit_mutation` 变成普通前端按钮直接调用；
5. 把 Approval Token、数据库凭据、模型 API Key 暴露给浏览器；
6. 为管理后台复制一套与 `pi` 不一致的业务实体与校验逻辑；
7. 继续把所有页面状态、管理状态和聊天状态塞进当前单一 `App.tsx + store.ts`。

---

# 2. pi-web 当前现状

当前 `pi-web` 是一个轻量、本地优先的 Coding Agent Web Shell：

```text
Browser
  |
WebSocket /ws
  |
pi-web Node Bridge
  |
spawn one `pi --mode rpc` process per WebSocket
```

当前代码特点：

- React 18 + Vite；
- Node + TypeScript + `ws`；
- `server/src/bridge.ts` 负责 WebSocket ↔ pi RPC；
- 每个浏览器连接启动一个独立 pi RPC 子进程；
- `web/src/App.tsx` 是单页 Chat Shell；
- `web/src/store.ts` 主要负责聊天流式状态；
- `shared/protocol.ts` 维护 Coding Agent RPC 的前端子集；
- 服务默认监听 `127.0.0.1`；
- 当前没有完整的多租户认证、项目上下文、RBAC 管理面；
- 当前 `ModelsConfig` 类型包含 `apiKey`，适用于 localhost 配置工具，但不能作为生产管理面的 Secret 传输协议。

因此，Industry Agent 管理功能应该在现有架构旁新增一个**独立 Control Plane**，而不是破坏现有 Coding Agent Chat RPC。

---

# 3. 总体目标

`pi-web` 最终承担 10 类操作与管理能力：

1. **Industry Chat / Workspace**：自然语言问答、工程部位/BOQ 查询、Working Memory、UI Actions、图片上传与识别确认；
2. **Mutation Center**：待确认 Proposal、Diff、用户显式确认、Commit、冲突和 post-commit reconciliation；
3. **Knowledge / RAG Center**：文档上传、Scope/ACL、Ingestion Pipeline、Chunk/Citation/Version；
4. **Trace & Audit Explorer**：trace_id、Timeline、Span Tree、LLM/Tool/Retrieval、Token/Cost、Mutation Audit；
5. **Retrieval / Entity Debug**：SemanticFrame、filters、candidate、BM25/Dense/RRF/Rerank、版本；
6. **Eval & Release Gate**：Corpus、Benchmark、Baseline/Candidate、Regression、Gate；
7. **Report Center**：Excel/PDF/Chart/Narrative、Evidence/lineage、Preview、Artifact；
8. **Sandbox Analysis**：Schema、SQL/Python、Static Validation、Broker queryId、attestation、结果血缘；
9. **Runtime / Adapter Configuration**：模型、检索、索引、Parser/Embedding/Reranker、Adapter health、Secret Reference；
10. **Operations / Qualification**：Staging health、Release readiness、Reconciliation、Adapter readiness、Gate 状态。

---

# 4. 系统职责边界

## 4.1 pi 仓库负责

`pi/packages/industry-agent` 是领域与安全内核，负责：Semantic Parsing、Entity Resolution、Retrieval、Tool Registry、READ Tool、Mutation Runtime、Approval Token 校验、RAG ACL、Working Memory、Trace contracts、Agent Loop budgets、Report safety contract、Sandbox policy、Eval / Release Gate、生产 Adapter 的领域 Port。

**所有最终安全规则必须以 `pi` 为准。** 即使 `pi-web` 前端隐藏了按钮，后端 Runtime 仍必须拒绝越权操作。

## 4.2 pi-web Server 负责

`pi-web/server` 是 BFF / Control Plane Gateway，负责：

- 用户认证会话；
- 将认证身份映射为可信 Principal；
- 创建 server-side `RequestContext`；
- 调用 Industry Agent API；
- WebSocket / SSE 流式事件代理；
- 上传/下载代理；
- Secret masking；
- CSRF / Origin / Request size / Rate Limit；
- 将 Trusted UI Confirmation 转成 server-side approve + commit；
- 管理页面的聚合查询；
- 浏览器不应持有的 token/credential；
- API-level idempotency；
- 对错误进行安全映射和脱敏。

`pi-web Server` **不重新实现领域权限和业务写逻辑**。

## 4.3 pi-web Web 负责

React 前端只负责展示、用户输入、显式交互确认、客户端视图状态、server state 缓存、分页/筛选、Trace/Eval/Report 可视化、UIAction 渲染、不可信 Tool/LLM 输出的安全展示。浏览器不是可信执行环境。

## 4.4 基础设施负责

真实基础设施只通过 `pi`/服务端 Adapter 访问：MySQL、OpenSearch、Object Storage、Embedding、Reranker、Parser/OCR/Multimodal、Renderer、Sandbox Runtime。

---

# 5. 推荐目标架构

```text
┌───────────────────────────────────────────────────────────────┐
│                         Browser                               │
│                                                               │
│  Industry Workspace     Management Console      Coding Chat   │
│  Mutation Review        RAG / Trace / Eval       existing UI  │
│  Report / Sandbox       Runtime / Ops                        │
└───────────────┬───────────────────┬───────────────────────────┘
                │ HTTPS             │ WS/SSE
                ▼                   ▼
┌───────────────────────────────────────────────────────────────┐
│                    pi-web Server / BFF                        │
│                                                               │
│ Auth / Principal / RequestContext                             │
│ Industry API Routes / Event Gateway                           │
│ UI Confirmation Broker                                       │
│ Upload / Artifact Proxy                                      │
│ Secret Masking / Redaction / Rate Limit                       │
│ Existing `/ws` Coding Agent RPC Bridge                        │
└───────────────┬─────────────────────────────┬─────────────────┘
                │                             │
                │ Industry Agent API          │ existing RPC
                ▼                             ▼
┌───────────────────────────────────┐   ┌───────────────────────┐
│        pi Industry Agent          │   │  pi Coding Agent RPC  │
│                                   │   │                       │
│ Context / Retrieval / Tools       │   └───────────────────────┘
│ Mutation / RAG / Memory           │
│ Eval / Report / Sandbox Policy    │
│ Trace / Audit                     │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│ MySQL / OpenSearch / Object Storage / Models / Sandbox        │
└───────────────────────────────────────────────────────────────┘
```

---

# 6. 关键架构决策

## 6.1 不把 Industry Agent 管理 API 塞进现有 `/ws`

现有 `/ws` 保持 Coding Agent RPC passthrough。Industry Agent 管理面新增：

```text
/api/industry/*
/events/industry/*    或 /ws/industry
```

管理查询需要分页、过滤、下载、上传；Mutation Confirmation 是安全敏感操作；Trace/Eval/Report 是长生命周期任务；管理面需要 RBAC；不能与“每个浏览器 Tab 启一个 pi coding process”绑定。

## 6.2 浏览器不直接调用 Industry Agent Runtime

必须：

```text
Browser -> pi-web BFF -> Industry Agent API / Service
```

不允许 Browser 直连 MySQL/OpenSearch/model/object storage credential/sandbox runtime。

## 6.3 Scope 由服务端生成

浏览器可以发送 `selectedProjectId` 作为选择意图，但 BFF 必须从认证 Session 获取 user/tenant/company memberships/roles，验证 project 访问权限，并服务端构造真正 `RequestContext`。客户端请求体中的 tenant/user/company/project/roles/permissions 不能直接成为可信 Scope。

## 6.4 Approval Token 不进入浏览器

推荐流程：

```text
GET proposal
 -> 展示 Diff
 -> 用户点“确认修改”
 -> POST /api/industry/mutations/{operationId}/confirm
      body: { digest, explicitConfirmation: true }
 -> pi-web Server:
      runtime.approve(...)
      runtime.commit(...)
 -> 返回 commit result
```

One-time Approval Token 只在 BFF ↔ Runtime 之间生成和消费，不写 localStorage、不写浏览器日志、不暴露给 React。

## 6.5 Secret 永不明文回传浏览器

现有 Model Config 的 `apiKey` 结构必须区分 `LOCAL_DEV_MODE` 和 `PRODUCTION_CONTROL_PLANE`。生产模式只返回：

```ts
interface SecretRef {
  configured: boolean
  source: 'env' | 'vault' | 'secret-manager'
  reference?: string
  lastUpdatedAt?: string
}
```

---

# 7. Web 信息架构

建议顶层路由：

```text
/chat
/industry/workspace
/industry/mutations
/industry/knowledge
/industry/traces
/industry/retrieval
/industry/eval
/industry/reports
/industry/sandbox
/industry/runtime
/industry/operations
```

长期建议使用真正的 URL Router，因为 Trace、Report、Eval Run 需要 deep link 和刷新恢复。

---

# 8. 页面设计

## 8.1 Industry Workspace

主工作面：Project Context + Conversation + Context Inspector。支持 Company/Project、流式 Answer、Tool 卡片、Table、Entity Picker、Missing Fields、Diff、Mutation Confirmation、Citation、Trace ID、Export、图片上传、Working Memory Inspector。

不显示 Approval Token、Secret、DB 连接信息、未脱敏系统 Prompt。

## 8.2 UIAction Renderer

对 `entity_picker / form / editable_form / diff / mutation_confirmation / table / multi_select / date_picker / report_preview / error_resolution` 实现统一 Registry。Renderer 不决定权限；action 可跳 Trace；mutation 显示 operationId 与 digest fingerprint；业务 ID 按 string；Markdown 禁止 raw HTML。

## 8.3 Mutation Center

路由：`/industry/mutations`、`/industry/mutations/:operationId`。

详情展示 operation、entity type、affected count、scope、record version、digest、samples、field diff、Trace、Audit Timeline。

确认时重新获取 Proposal、校验 digest、用户显式确认、BFF server-side approve + commit。`MUTATION_COMMIT_FINALIZATION_FAILED` 必须显示“业务写可能已经成功，禁止重试，进入对账队列”。

## 8.4 Knowledge / RAG Center

管理文档上传、Industry/Company/Project/Department、Visibility、ACL Users/Roles、Security Tags、pipeline state、parser/chunker/embedding/index versions、chunk preview、quality gate 和失败信息。所有操作 server-side 授权。

## 8.5 Trace & Audit Explorer

支持 traceId/requestId/conversationId/user/company/project/module/tool/status/time/error code 搜索。Detail 提供 Overview、Timeline、Span Tree、Raw/Debug 四个 Tab，并按权限区分 Basic/Debug/Prompt。默认脱敏 Secret/API Key/Authorization/Cookie/Approval Token/DB DSN。

## 8.6 Retrieval Debug Center

展示 Original Query、SemanticFrame、Hard Filters、Normalized Chainage、Exact/BM25/Dense/RRF/Rerank/Business Feature、Final Score、Confidence、Index/Model/Config version。只读，不提供业务写入口。

## 8.7 Eval & Release Gate

展示 corpus version/case count/fingerprint、baseline、candidate、run/gate status、metrics、sample counts、regression、failed cases、critical E2E、component version diff。前端不能手工把 Gate 设为 PASS；结果由 `pi` Release Gate 计算。

## 8.8 Report Center

支持 Excel/PDF/Chart/Narrative 列表、Preview、Artifact metadata、Evidence、lineage、source versions、Trace 和授权下载。Object key 本身不能作为下载授权。

## 8.9 Sandbox Analysis

展示 Goal、Generated Plan、Schema、只读 SQL、Validator、tables/columns/LIMIT/queryId/Broker policy、Python source hash、runtime attestation、结果表、derived evidence、report handoff。没有 arbitrary SQL execute；mutation 只能 handoff 到 Mutation Center。

## 8.10 Runtime / Adapter Configuration

展示 Agent model、Embedding、Reranker、OpenSearch、RAG Parser、Object Storage、Multimodal、Renderer、Sandbox、Trace/Audit persistence 的 Adapter、Endpoint alias、Configured、Health、Version、Secret Source。配置采用 Draft -> Validate -> Diff -> Save -> version bump -> Eval；不能改参数后直接生产生效。

## 8.11 Operations / Qualification

展示 CI、Adapter Readiness、Staging Infra、Trace/Audit、Eval Gate、A–D E2E、Renderer、Sandbox、DB Approval、Production Approval，并关联 commit SHA、workflow run、Eval runId、traceId、artifact、audit record。

---

# 9. 身份、认证与授权模型

保留 `PI_WEB_MODE=local` 用于当前 localhost Coding Chat；新增 `PI_WEB_MODE=control-plane`。Control-plane 要求 OIDC/SSO 或可信上游认证、HttpOnly Secure SameSite Session、CSRF、防 WebSocket 未认证 upgrade，并构造 server Principal。

建议 Principal：

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

最终 `RequestContext` 仍应由服务端根据资源访问结果生成。

---

# 10. BFF API 设计

API Version：`/api/industry/v1`。

Context：

```text
GET  /context
POST /context/project
```

Workspace/Chat：

```text
POST /conversations
GET  /conversations/:id
POST /conversations/:id/messages
GET  /conversations/:id/events
POST /conversations/:id/abort
POST /conversations/:id/images
```

Mutation：

```text
GET  /mutations
GET  /mutations/:operationId
POST /mutations/:operationId/confirm
POST /mutations/:operationId/reject
GET  /mutations/:operationId/audit
GET  /mutations/reconciliation
```

Confirm body 只接受 digest + explicitConfirmation，不接受客户端 Approval Token。

RAG：

```text
GET  /knowledge/documents
POST /knowledge/uploads
GET  /knowledge/documents/:id
POST /knowledge/documents/:id/reingest
GET  /knowledge/documents/:id/chunks
GET  /knowledge/ingestions/:id
```

Trace：

```text
GET /traces
GET /traces/:traceId
GET /traces/:traceId/timeline
GET /traces/:traceId/tree
GET /traces/:traceId/stats
```

Eval：

```text
GET  /eval/corpus
GET  /eval/runs
POST /eval/runs
GET  /eval/runs/:id
POST /eval/baselines/:runId/accept
GET  /eval/gate
```

Report：

```text
GET  /reports
POST /reports
GET  /reports/:id
GET  /reports/:id/preview
GET  /reports/:id/download
```

Sandbox：

```text
POST /sandbox/runs
GET  /sandbox/runs
GET  /sandbox/runs/:id
POST /sandbox/runs/:id/cancel
POST /sandbox/runs/:id/prepare-mutation
```

禁止 `execute-arbitrary-sql` 和 `commit-mutation` 路由。

Runtime：

```text
GET  /runtime/adapters
GET  /runtime/configs
POST /runtime/configs/validate
POST /runtime/configs/drafts
POST /runtime/configs/:id/promote
```

---

# 11. Event Protocol

不要把 Industry Agent event 全部塞进现有 Coding RPC `RpcEvent`。建议新增 `shared/industry/common.ts / api.ts / events.ts / ui-actions.ts / traces.ts`。

统一 Envelope：

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

要求：sequenceNo 单 trace 单调、重连支持 afterSequenceNo、按 eventId 去重、payload schema 校验、未知 event 安全忽略。

---

# 12. 前端代码组织

从当前 `App.tsx + store.ts + components` 渐进拆分为：

```text
web/src/
  app/
    App.tsx
    routes.tsx
    AppShell.tsx
  features/
    coding-chat/
    industry-workspace/
    mutations/
    knowledge/
    traces/
    retrieval/
    eval/
    reports/
    sandbox/
    runtime/
    operations/
  components/
    ui/
    data-table/
    json-viewer/
    error-boundary/
  api/
    http-client.ts
    industry-client.ts
    event-client.ts
  auth/
    principal.ts
    guards.tsx
  state/
    app-context.ts
```

Chat reducer 不再承担整个管理平台；大列表服务端分页；浏览器不缓存 Secret；Mutation/Report/Sandbox 独立 feature state。

---

# 13. Server 代码组织

建议：

```text
server/src/
  main.ts
  coding/
    bridge.ts
    rpc-client.ts
  industry/
    router.ts
    auth.ts
    context.ts
    event-gateway.ts
    upload.ts
    artifact.ts
    clients/
      industry-agent-client.ts
    routes/
      context.ts
      conversations.ts
      mutations.ts
      knowledge.ts
      traces.ts
      eval.ts
      reports.ts
      sandbox.ts
      runtime.ts
      operations.ts
  security/
    csrf.ts
    origin.ts
    redaction.ts
    rate-limit.ts
    request-limits.ts
```

`IndustryAgentClient` 是 BFF 与 `pi` 的唯一入口。具体 Transport 推荐 HTTP/JSON + SSE。`pi-web` Server 不应直接 import 多个 `industry-agent` 内部文件形成跨仓库源码耦合。

---

# 14. pi ↔ pi-web 服务契约

推荐在 `pi` 提供稳定的 Industry Agent Service API，而不是让 `pi-web` 理解内部 Repository。

```text
pi-web:
  Web UX
  Auth
  BFF
  Trusted Confirmation

pi:
  Industry Agent Application Service
  Domain Policy
  Persistence Adapter
  Retrieval
  Mutation
  RAG
  Eval
  Report
  Sandbox
```

版本：`industry-api-v1 / industry-event-v1 / ui-action-v1`。Breaking change 必须新版本 + Contract test + 双仓兼容窗口。

---

# 15. Mutation 的可信 UI 设计

Confirm 页面展示 operation、entity type、affected count、target IDs、before/after、changed fields、record version、digest、project、user、prepare time、trace。

高风险批量可以要求输入“确认修改 N 条记录”，但真正安全仍由 Runtime permission/scope/digest/version/nonce/token/transaction/verify 保证。

`POST /confirm` 需要 `Idempotency-Key`。浏览器超时时先查询 operation 状态，不能自动再次 commit。

---

# 16. Trace / Audit 数据安全

至少分 `trace.read.basic / trace.read.debug / trace.read.prompt / audit.read / mutation.audit.read`。Basic 只看 duration/status/tool/token/error；Debug 看 filters/candidates/non-sensitive args；Prompt 权限才可看原始输入/Prompt/retrieved text。

前端 JsonViewer 还需二次 masking，不能只依赖后端。

---

# 17. 文件上传与 Artifact 下载

上传要求 MIME+signature、size limit、filename sanitize、permission、project scope、checksum、trace，生产建议 antivirus/content inspection。大文件不进 WebSocket JSON。

Report/Artifact 下载必须先 authorize，再短期 stream/url。Object key 不能当授权。

---

# 18. 大数据表格设计

工程实体、BOQ、Trace、Chunk、Eval failures 必须 server pagination、stable cursor、column/sort/filter allowlist、row selection、selectedRows 对接 Working Memory、export 使用 server-side snapshot ID。禁止一次拉十万行到浏览器筛选。

---

# 19. Error UX

统一错误：

```ts
interface IndustryApiError {
  requestId: string
  traceId?: string
  code: string
  message: string
  retryable: boolean
  resolution?: {
    type: 'refresh' | 'reauth' | 'reselect_project' | 'open_reconciliation' | 'contact_admin'
  }
}
```

Scope 错误不 Retry；Version conflict 要刷新后重新 Prepare；Finalization failure 禁止 Retry并打开 reconciliation；Insufficient Evidence 显示证据不足并可跳 Retrieval/Trace。

---

# 20. 性能与实时性

流式聊天使用 WS/SSE；管理查询 REST；Eval/RAG/Report/Sandbox 用 POST job -> jobId -> event/polling -> terminal state；Event stream 支持 last sequence resume 和 REST fallback。

---

# 21. 安全要求

Browser：CSP、no raw HTML、secure Markdown、no Secret、no Approval Token、no DB credential、CSRF、XSS-safe JSON、download auth。

WebSocket：Origin validation、session auth、message size、command allowlist、rate limit、per-user connection cap。

Server：request/upload limit、structured audit、log redaction、timeout、AbortSignal、rate limit、idempotency、SSRF guard。

配置：Secret reference only、config version、diff、role、changed config triggers Eval、promotion requires Gate PASS。

当前 Coding RPC bridge 的“客户端任意 command.type 默认转发”模式不应复制到 Industry Control Plane。

---

# 22. RBAC 建议

| Role | Workspace | Mutation Confirm | RAG Manage | Trace Debug | Eval | Runtime Config | Ops |
|---|---:|---:|---:|---:|---:|---:|---:|
| User | ✓ | own/authorized | upload optional | own basic | - | - | - |
| Project Manager | ✓ | project | project | project | view | - | view |
| Knowledge Admin | ✓ | - | ✓ | relevant | view | - | view |
| Auditor | read | read | read | ✓ | read | read | ✓ |
| Agent Admin | ✓ | policy-based | ✓ | ✓ | ✓ | ✓ | ✓ |
| Release Admin | read | - | read | ✓ | accept baseline | promote | ✓ |

真实 Permission 必须来自后端。

---

# 23. 审计事件

pi-web 自己也需要 Control Plane Audit：LOGIN、PROJECT_CONTEXT_CHANGED、MUTATION_CONFIRM_CLICKED、MUTATION_REJECTED、KNOWLEDGE_UPLOADED、KNOWLEDGE_REINGEST_REQUESTED、EVAL_STARTED、BASELINE_ACCEPTED、CONFIG_DRAFT_CREATED、CONFIG_PROMOTED、REPORT_DOWNLOADED、SANDBOX_RUN_STARTED、RECONCILIATION_OPENED。

不要把“用户点确认”和“Runtime commit 成功”合成一个事件。

---

# 24. 配置模式

建议：

```text
PI_WEB_MODE=local
PI_WEB_MODE=control-plane
```

Local 保持当前 localhost Coding Chat 和本机 ModelConfig；Control-plane 必须认证、禁止明文 apiKey、启用 Industry 管理面、Secret ref、上传/报告/审计/Eval。

---

# 25. 开发实施顺序

## Web Phase 0：架构拆分和安全基线

保留现有 Coding Chat；新增 AppShell、`/industry`、shared industry protocol、BFF router、AuthPrincipal/server RequestContext contract、control-plane mode、Secret masking，并禁止 Approval Token 下发浏览器。

验收：`/chat` 不回归、`/industry` 空 Dashboard 可进入、Scope 只能服务端产生、生产模式不返回 apiKey。

## Web Phase 1：Industry Workspace + UIAction

Project Context、conversation、event stream、UIAction renderer、Table、Entity Picker、Missing Fields、Citation、Trace link、Image upload。

## Web Phase 2：Mutation Center

Proposal list/detail、Diff、confirm、reject、version conflict、finalization failure、reconciliation；完整集成 Trusted UI Confirmation。

## Web Phase 3：Trace / Audit / Retrieval Debug

Trace search/timeline/span tree/token/cost/tool/retrieval debug/redaction。

## Web Phase 4：RAG Management

upload、ACL、ingestion states、chunks、versions、citation source。

## Web Phase 5：Eval / Release Gate

corpus、run、metrics、regression、baseline、gate、critical E2E。

## Web Phase 6：Report + Sandbox

Report list/preview/download、Sandbox runs、SQL/Python readonly view、attestation、lineage、prepare mutation handoff。

## Web Phase 7：Runtime / Operations

adapter health、config version、staging qualification、release readiness、operational dashboards。

---

# 26. 每阶段 DoD

每个 Web Phase：Design contract -> shared types -> server route -> auth/scope test -> web UI -> web test -> server test -> security review -> error-path test -> integration test -> self review -> fix -> second review -> phase acceptance。

必须检查：没有 Secret 泄露、没有客户端 Scope 信任、没有 Mutation bypass、没有 arbitrary SQL、没有 raw HTML、有 traceId/requestId、有分页、有错误/loading/empty/permission state。

---

# 27. 测试策略

Shared Contract：schema version、unknown event、optional fields、18-digit IDs、backward compatibility。

Server：unauthenticated、wrong tenant/project、CSRF、origin、oversized request、approval token never returned、secret masking、idempotency、event reconnect。

Web：UIAction、Mutation Diff、permission、trace timeline、large table、error resolution、reconciliation、markdown injection、prompt injection as data。

Cross-repo：`pi` 和 `pi-web` 跑相同 contract fixtures。推荐 versioned JSON fixture + canonical hash。

---

# 28. 与生产资格计划的关系

| Qualification Gate | pi-web 责任 |
|---|---|
| Gate 0 CI | pi-web build/typecheck/test |
| Gate 1 Adapter | 管理面显示 readiness，不实现领域 Adapter |
| Gate 2 Staging | auth/config/health UI |
| Gate 3 Trace/Audit | Trace Explorer + Reconciliation |
| Gate 4 Eval | Eval/Release Gate UI |
| Gate 5 A–D | Workspace/Mutation/RAG/Trace 形成 E2E |
| Gate 6 Report/Sandbox | Report/Sandbox UI |
| Gate 7 Security | Web/BFF security test |
| Gate 8 Release | Operations/Readiness Dashboard |

---

# 29. 第一批必须做的具体任务

下一次开发只执行 **Web Phase 0**：

1. 创建 `shared/industry/` contract；
2. 保留现有 Coding Agent protocol；
3. 新建 `web/src/app/AppShell.tsx`；
4. 拆分 `/chat` 和 `/industry`；
5. 新建 `web/src/features/industry-dashboard/`；
6. 新建 `server/src/industry/router.ts`；
7. 新建 `server/src/industry/auth.ts`；
8. 新建 `server/src/industry/context.ts`；
9. 定义 `IndustryAgentClient` Port；
10. 实现 mock client，不连接 MySQL/OpenSearch；
11. 实现 `GET /api/industry/v1/context`；
12. 实现 `GET /api/industry/v1/health`；
13. 加 control-plane/local 双模式；
14. 生产模式禁止返回模型 `apiKey`；
15. 为 Scope/Secret/Approval Token 边界写测试；
16. typecheck；
17. server test；
18. web test；
19. 安全自审；
20. 再审后提交。

Web Phase 0 禁止连接 MySQL、接 OpenSearch、做真实 Mutation/RAG/Report/Sandbox、一次实现全部页面。

---

# 30. 第一阶段目录目标

完成 Web Phase 0–2 后预计：

```text
pi-web/
├── shared/
│   ├── protocol.ts
│   └── industry/
│       ├── common.ts
│       ├── api.ts
│       ├── events.ts
│       └── ui-actions.ts
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
│   │   ├── clients/industry-agent-client.ts
│   │   └── routes/
│   │       ├── context.ts
│   │       ├── conversations.ts
│   │       └── mutations.ts
│   └── security/
│       ├── redaction.ts
│       └── request-limits.ts
└── web/src/
    ├── app/
    │   ├── App.tsx
    │   └── AppShell.tsx
    ├── features/
    │   ├── coding-chat/
    │   ├── industry-workspace/
    │   └── mutations/
    ├── api/
    │   ├── industry-client.ts
    │   └── event-client.ts
    └── components/ui-actions/
```

不要求 Phase 0 一次性重命名旧文件，迁移可以渐进进行。

---

# 31. 两轮设计审查记录

## 31.1 第一轮：架构/安全审查

- **现有每 Tab 一个 pi RPC 进程不能承担管理功能**：Coding Chat 继续 RPC；Industry 管理面独立 BFF/API/Event Gateway。
- **现有 Model Config 允许 apiKey 出现在共享协议**：local/control-plane 双模式；control-plane 只返回 SecretRef。
- **Approval Token 若发给浏览器会扩大攻击面**：浏览器只确认 operationId+digest，BFF 内部 approve+commit。
- **Scope 前端透传会形成越权路径**：project selection 仅候选，BFF 验证后创建 RequestContext。
- **单一 store 不适合十个管理域**：按 feature 拆分 server state 和 UI state。

第一轮结论：**PASS WITH FIXES**。

## 31.2 第二轮：可实施性/失败路径审查

- **Mutation finalization failure 不能普通 Retry**：单独 UX + reconciliation。
- **长任务不能依赖单个 WebSocket request**：Job + Event + REST terminal state + sequence resume。
- **Trace Debug 会泄密**：Basic/Debug/Prompt 分权 + 双层 redaction。
- **大结果不能全部进浏览器**：server paging/cursor/export snapshot。
- **RAG ACL 管理不能任意 Scope 编辑**：ACL 候选由服务端返回，Runtime 再校验。
- **Sandbox 不能做成 SQL Console**：只展示 approved/generated SQL，无 arbitrary execute，mutation handoff。
- **跨仓协议会漂移**：`industry-api-v1 / industry-event-v1 / ui-action-v1` + contract fixtures + breaking version bump。

第二轮结论：**PASS**。

---

# 32. 最终设计判定

架构：**PASS**。推荐 `pi-web = Interaction + Management/Control Plane`、`pi = Industry Agent Execution / Policy Plane`，不把 pi-web 变成第二套 Agent Runtime。

安全：**PASS WITH IMPLEMENTATION REQUIREMENTS**。开发必须保证 server-derived RequestContext、no browser Secret、no browser Approval Token、no DB/OpenSearch direct access、no mutation bypass、Trace redaction、upload/download authorization、Sandbox read-only、config promotion requires version/eval policy。

实施起点：下一步只做 **Web Phase 0：pi-web 架构拆分 + Control Plane 安全基线**，完成审查后再进入 Workspace/UIAction。

---

# 33. 数据库边界再次确认

本设计不会改变已有数据库规则：

```text
MySQL connection        NOT AUTHORIZED
Migration execution     NOT AUTHORIZED
DDL execution           NOT AUTHORIZED
DML execution           NOT AUTHORIZED
Real mutation commit    NOT AUTHORIZED
```

`pi-web` Phase 0 只使用 Mock IndustryAgentClient、fixture、in-memory response、contract test。直到用户后续明确给出 `DB_CONNECT_APPROVAL` / `DB_EXECUTION_APPROVAL`。
