# PI Web Industry Agent 评测平台设计与实施规划 v1.0

日期：2026-09-12  
目标项目：`leoszw/pi-web`  
目标目录：`docs/design-docs/`  
关联执行内核：`leoszw/pi/packages/industry-agent`  
关联评测资产：`leoszw/pi/evals/industry-agent/*`  
文档性质：评测平台架构设计 + 产品规划 + API/数据模型 + 分阶段实施计划  
数据库状态：**NOT AUTHORIZED / NOT EXECUTED**。本设计不授权连接或执行 MySQL。

---

# 1. 设计目标

Industry Agent 已经具备意图识别、语义归一化、工程部位/BOQ 召回、RAG、READ Tool、Mutation、Working Memory、图片输入、Agent Loop、Report、Sandbox 等能力。

下一阶段 `pi-web` 不能只做“业务操作后台”，必须同时成为一个**可长期使用的 Agent Evaluation Workbench / Quality Control Plane**。

评测平台必须解决两个不同问题：

```text
研发问题：
“为什么这个问题答错了？”
“意图分错在哪里？”
“为什么向量召回没召到？”
“RRF / Reranker 哪一步把正确结果排掉了？”
“Tool 为什么选错？”
```

以及：

```text
发布问题：
“这次 Prompt/Embedding/Reranker/Normalizer 改动到底变好还是变差？”
“是否达到发布阈值？”
“是否出现关键场景回退？”
“是否允许 promote 到 Staging/Production？”
```

因此设计采用双层体系：

```text
专项评测工具
  ├─ Intent Eval
  ├─ Normalization Eval
  ├─ Entity Eval
  ├─ Retrieval Eval
  ├─ RAG Eval
  ├─ Tool Eval
  ├─ Memory Eval
  ├─ Mutation Eval
  ├─ Multimodal Eval
  ├─ Agent Loop Eval
  ├─ Report Eval
  ├─ Sandbox Eval
  └─ Trace/Token Eval

统一 Benchmark / Release Gate
  ├─ Golden Corpus
  ├─ Baseline
  ├─ Candidate Run
  ├─ Regression Diff
  ├─ Critical E2E
  └─ PASS / BLOCK
```

**评测工具是 pi-web Control Plane 的一级功能，不是可选附属页。**

---

# 2. 当前已有基础

`pi` 当前已有的评测资产按目录已经覆盖：

```text
evals/industry-agent/
  agent-loop/
  entity/
  golden/
  intent/
  memory/
  multimodal/
  mutation/
  normalization/
  rag/
  report/
  retrieval/
  sandbox/
  tools/
```

Phase 11 还已经建立：

- 1030 条 Golden / Hard Corpus；
- Corpus version / manifest / fingerprint；
- Offline Benchmark Runner Contract；
- 指标计算；
- Baseline / Candidate Regression；
- Release Gate；
- Critical E2E；
- version bump 检查；
- corpus 100% coverage；
- 最低样本数；
- Mutation Wrong-target / Approval Consistency 等安全门禁。

因此 `pi-web` 不应该重新实现指标算法。

正确职责是：

```text
pi
  = Evaluation Engine / Metrics / Gate Policy / Executor Contracts

pi-web
  = Dataset / Run / Comparison / Visualization / Error Analysis /
    Human Review / Baseline Management / Release Control Plane
```

---

# 3. 核心原则

## 3.1 统一评测平台，不做散落脚本

所有模块的评测共享：

- Dataset；
- Case；
- Run；
- Observation；
- Metric；
- Baseline；
- Candidate；
- Comparison；
- Failure；
- Tag；
- Version；
- Artifact；
- Review；
- Gate。

禁止每个模块独立发明一套：

```text
intent_eval_result.json
retrieval_debug_result_v2.json
rag_test_new.json
tool_test_final_final.json
```

统一进入 Evaluation Domain。

## 3.2 评测计算由 pi 决定

`pi-web` 不应该重新计算：

- Recall@K；
- MRR；
- nDCG；
- Mention F1；
- Intent F1；
- RRF；
- Release Gate。

否则 Web 与 Runtime 会出现口径漂移。

pi-web 只展示 `pi` 返回的 Metric/Observation。

## 3.3 Eval Run 必须可复现

每个 Run 必须绑定：

```text
git commit
dataset version
corpus fingerprint
prompt version
normalizer version
embedding model/version
index version
RRF config version
reranker version
tool schema version
parser/chunker version
runtime config fingerprint
environment
random seed（如适用）
```

没有这些信息的结果只能标记：

```text
AD_HOC
```

不能成为正式 Baseline。

## 3.4 评测数据与生产数据隔离

评测平台不允许为了方便：

- 直接复制生产 Secret 到浏览器；
- 任意访问生产数据库；
- 用 Production Mutation 做评测；
- 将真实敏感文档无限制导入 corpus。

需要真实数据时必须：

- 脱敏；
- 固化快照；
- 版本化；
- Scope 明确；
- 权限审计。

## 3.5 离线评测和在线观测分开

```text
Offline Eval
  = 可复现、可比较、可做 Release Gate

Online Quality Observation
  = 真实流量抽样、发现分布漂移、发现新 Hard Case
```

在线样本不能自动修改 Golden Label。

必须经过人工 Review 才能进入正式 Corpus。

---

# 4. pi-web 信息架构

评测作为一级菜单：

```text
/industry/eval
```

下设：

```text
/industry/eval/overview
/industry/eval/datasets
/industry/eval/runs
/industry/eval/compare
/industry/eval/failures
/industry/eval/playground/intent
/industry/eval/playground/retrieval
/industry/eval/playground/rag
/industry/eval/baselines
/industry/eval/release-gate
/industry/eval/reviews
/industry/eval/online-quality
```

推荐导航：

```text
Evaluation
├─ Overview
├─ Intent
├─ Retrieval
├─ RAG
├─ Tool & Agent
├─ Safety
├─ Datasets
├─ Runs
├─ Compare
├─ Failures
├─ Baselines
└─ Release Gate
```

---

# 5. 统一 Evaluation Domain

## 5.1 Eval Dataset

```ts
interface EvalDataset {
  datasetId: string
  name: string
  domain: EvalDomain
  version: string
  status: 'DRAFT' | 'REVIEWED' | 'BASELINE_READY' | 'ARCHIVED'

  caseCount: number
  tags: string[]
  source: 'CURATED' | 'PRODUCTION_REVIEW' | 'SYNTHETIC' | 'IMPORT'

  fingerprint: string

  createdBy: string
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
}
```

## 5.2 Eval Case

```ts
interface EvalCase {
  caseId: string
  datasetId: string
  domain: EvalDomain

  input: EvalInput
  expected: EvalExpected

  tags: string[]
  difficulty: 'NORMAL' | 'HARD' | 'ADVERSARIAL'
  critical: boolean

  sourceRef?: string
  notes?: string

  labelVersion: string
  reviewed: boolean
}
```

## 5.3 Eval Run

```ts
interface EvalRun {
  runId: string

  datasetId: string
  datasetVersion: string
  datasetFingerprint: string

  runType:
    | 'INTENT'
    | 'NORMALIZATION'
    | 'ENTITY'
    | 'RETRIEVAL'
    | 'RAG'
    | 'TOOL'
    | 'MEMORY'
    | 'MUTATION'
    | 'MULTIMODAL'
    | 'AGENT_LOOP'
    | 'REPORT'
    | 'SANDBOX'
    | 'TRACE_TOKEN'
    | 'E2E'
    | 'FULL_RELEASE'

  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'INVALID'

  environment: 'LOCAL' | 'CI' | 'STAGING'

  componentVersions: ComponentVersionSnapshot
  configFingerprint: string
  gitCommit: string

  startedAt?: string
  completedAt?: string

  summary?: MetricSummary
}
```

## 5.4 Observation

一条 case 的实际输出统一记录：

```ts
interface EvalObservation {
  caseId: string
  runId: string

  output: unknown

  metrics: Record<string, number>
  passedAssertions: string[]
  failedAssertions: string[]

  traceId?: string

  latencyMs?: number
  tokenUsage?: TokenUsage
  cost?: number

  artifacts?: EvalArtifactRef[]
}
```

## 5.5 Comparison

```ts
interface EvalComparison {
  baselineRunId: string
  candidateRunId: string

  aggregateDiff: MetricDiff[]
  regressions: RegressionCase[]
  improvements: RegressionCase[]
  unchanged: number

  criticalFailures: string[]

  gateResult?: 'PASS' | 'BLOCKED'
}
```

---

# 6. Eval Domain 枚举

统一：

```ts
type EvalDomain =
  | 'INTENT'
  | 'NORMALIZATION'
  | 'ENTITY'
  | 'ENGINEERING_RETRIEVAL'
  | 'BOQ_RETRIEVAL'
  | 'RAG_RETRIEVAL'
  | 'RAG_ANSWER'
  | 'TOOL_SELECTION'
  | 'TOOL_ARGUMENT'
  | 'MEMORY'
  | 'MUTATION'
  | 'MULTIMODAL'
  | 'AGENT_LOOP'
  | 'REPORT'
  | 'SANDBOX'
  | 'TRACE_TOKEN'
  | 'E2E'
```

---

# 7. 第一优先级：Intent Evaluation Tool

意图识别评测必须是第一批完成的专项工具之一。

## 7.1 目标

回答：

```text
用户问法到底被识别成什么 Intent？
候选 Intent 有哪些？
正确 Intent 是否进入 Top-K？
为什么误判？
是否因为上下文改写导致误判？
哪个 Prompt/Model/Parser 版本造成回退？
```

## 7.2 Dataset Case

```json
{
  "caseId": "intent-000123",
  "query": "K12+300到K12+800左幅有哪些清单项",
  "context": {
    "previousTurns": []
  },
  "expected": {
    "primaryIntent": "QUERY_BOQ",
    "acceptableIntents": ["QUERY_BOQ"],
    "mustNot": ["MUTATION"]
  },
  "tags": [
    "chainage",
    "alignment",
    "boq",
    "engineering"
  ],
  "difficulty": "NORMAL"
}
```

上下文依赖 Case：

```json
{
  "query": "第二个呢",
  "context": {
    "previousResolvedIntent": "QUERY_BOQ",
    "resultSet": ["..."]
  },
  "expected": {
    "primaryIntent": "QUERY_BOQ"
  },
  "tags": ["context", "deictic"]
}
```

## 7.3 指标

必须支持：

- Accuracy；
- Macro F1；
- Micro F1；
- Per-intent Precision；
- Per-intent Recall；
- Per-intent F1；
- Top-K Recall；
- Confusion Matrix；
- Unknown / Reject Precision；
- Clarification Rate；
- Wrong Mutation Intent Rate；
- Context-dependent Accuracy；
- Hard-case Accuracy。

安全指标：

```text
Mutation false positive
```

必须单独展示，不能被总 Accuracy 掩盖。

## 7.4 Intent Playground

页面：

```text
/industry/eval/playground/intent
```

输入：

- query；
- previous turns；
- active project；
- model/prompt/parser version。

输出：

```text
Primary Intent
Candidate Intents
Confidence
SemanticFrame
Reason / Evidence（若 Runtime 提供）
Version
Trace
```

支持：

```text
Save as Eval Case
Add to Existing Dataset
Mark as Hard Case
```

## 7.5 Failure Explorer

过滤：

- expected intent；
- actual intent；
- query pattern；
- context/no-context；
- model version；
- prompt version；
- confidence range；
- tag。

可视化：

```text
Confusion Matrix
Error Clusters
Low-confidence correct
High-confidence wrong
```

---

# 8. 第二优先级：Vector / Hybrid Retrieval Evaluation Tool

向量召回评测不能只显示“最终 Top 10”。

必须能拆开：

```text
Exact
BM25
Dense Vector
Entity-aware
RRF
Reranker
Business Feature
Final Ranking
```

否则无法定位到底是哪一层有问题。

---

# 9. Retrieval Dataset

## 9.1 Engineering Position

Case：

```json
{
  "caseId": "eng-ret-001",
  "query": "K12+300 到 K12+800 左幅路基",
  "scope": {
    "projectId": "p1"
  },
  "expected": {
    "relevantEntityIds": ["ep-101", "ep-102"],
    "primaryEntityId": "ep-101"
  },
  "tags": [
    "chainage",
    "left-alignment",
    "roadbed"
  ]
}
```

## 9.2 BOQ

```json
{
  "caseId": "boq-ret-001",
  "query": "C30混凝土基础",
  "expected": {
    "relevantEntityIds": ["boq-3301"],
    "criticalSpecs": {
      "concreteGrade": "C30"
    }
  }
}
```

## 9.3 Hard Negative

必须有：

```text
C30 vs C35
左幅 vs 右幅
K12+300 vs K21+300
φ20 vs φ22
5cm vs 15cm
某项目 A vs 某项目 B
旧版本/已删除实体
```

Hard Negative 是检索评测的一等 Case 类型。

---

# 10. Retrieval 指标

## 10.1 基础指标

- Recall@1；
- Recall@5；
- Recall@10；
- Recall@20；
- Recall@50；
- Hit@1；
- MRR；
- MAP；
- nDCG@K；
- Zero-result Rate。

## 10.2 分阶段指标

### Dense-only

```text
Dense Recall@K
Dense MRR
```

### BM25-only

```text
BM25 Recall@K
BM25 MRR
```

### RRF

```text
RRF Recall@K
RRF nDCG
```

### Rerank

```text
Rerank Hit@1
Rerank MRR
Rerank nDCG
```

### Final

```text
Final Hit@1
Final MRR
Final nDCG
```

## 10.3 安全 / 业务指标

必须额外有：

- Cross-project leakage = 0；
- Cross-company leakage = 0；
- Cross-alignment conflict；
- Critical Spec Conflict；
- Deleted Entity Hit Rate；
- Wrong Entity High-confidence Rate；
- Filter Relaxation Rate；
- Zero Result Rate；
- Ambiguous Result Rate。

---

# 11. Retrieval Playground

页面：

```text
/industry/eval/playground/retrieval
```

允许：

- 选择 Engineering / BOQ / RAG；
- 输入 query；
- 选择 project；
- 选择 index version；
- 选择 embedding version；
- 选择 reranker；
- 调整实验性权重（只在 Eval 环境）；
- 比较两组配置。

展示：

```text
Semantic Parse
Hard Filters

Exact Candidates
BM25 Candidates
Dense Candidates

RRF Table
Rerank Table
Business Feature

Final Ranking
```

每个候选显示：

```text
entityId
name
score
rank
source arm
dense score
bm25 score
rrf score
rerank score
business score
filter/debug reason
```

支持：

```text
A/B Side-by-Side
```

例如：

```text
Baseline: embedding-v3 + reranker-v2
Candidate: embedding-v4 + reranker-v3
```

每个 query 直接显示 rank movement：

```text
ep-101  #7 -> #1
ep-204  #2 -> #9
```

---

# 12. Embedding Version Evaluation

Embedding 升级必须有专项工具。

比较：

```text
Embedding A
Embedding B
```

要求固定：

- 同 Corpus；
- 同 BM25；
- 同 RRF；
- 同 Reranker（如果评 Dense 本身）；
- 同 filters。

指标：

```text
Recall@20
Recall@50
MRR
Hard Negative Error
Vector zero-result
Latency
Cost
```

还要按 query type 分 bucket：

```text
code
chainage
short entity
context
spec
synonym
typo
abbreviation
```

禁止只看一个全局平均数。

---

# 13. Reranker Evaluation

同理必须提供 Reranker 专项对比。

输入固定 Candidate Pool。

指标：

- Hit@1；
- MRR；
- nDCG；
- Relevant demotion count；
- Hard-negative promotion count；
- latency；
- token/cost（若模型计费）。

页面要显示：

```text
Before Rank
After Rank
Relevance Label
Rerank Score
Movement
```

---

# 14. Normalization Evaluation

覆盖：

- 桩号；
- chainage range；
- left/right alignment；
- local side；
- unit；
- BOQ code；
- date；
- specification；
- abbreviation；
- Chinese/English mixed terms。

Case：

```text
input
expected normalized value
actual
```

指标：

- exact accuracy；
- field accuracy；
- invalid input reject precision；
- range normalization correctness；
- conflict detection。

必须支持 Property-based / boundary cases：

```text
K12+0
K12+999
K12+1000 invalid form
reverse range
negative offset
```

---

# 15. Entity Resolution Evaluation

评：

```text
mention -> canonical entity
```

指标：

- Mention F1；
- Entity Recall@K；
- Exact Match；
- Ambiguity Detection；
- Wrong Project Match；
- Parent/Child hierarchy correctness；
- alias match；
- deleted entity filtering。

Failure 页面必须区分：

```text
Mention detection failed
Candidate generation failed
Ranking failed
Scope failed
Ambiguity policy failed
```

---

# 16. RAG Evaluation

RAG 至少拆成两部分：

```text
Retrieval Eval
Answer Eval
```

不能把两者混成一个分数。

## 16.1 RAG Retrieval

指标：

- Recall@K；
- nDCG；
- MRR；
- document hit；
- chunk hit；
- parent-context gain；
- duplicate rate；
- ACL leakage = 0。

## 16.2 RAG Answer

指标：

- Groundedness；
- Citation Correctness；
- Citation Completeness；
- Answer Relevance；
- Unsupported Claim Rate；
- Refusal Correctness；
- Insufficient Evidence Correctness。

安全门禁：

```text
ACL Leakage = 0
Unsupported authoritative claim <= threshold
```

## 16.3 Citation Inspector

Case Detail 显示：

```text
Question
Expected Evidence
Retrieved Chunks
Parent Context
Generated Answer
Claim -> Citation Mapping
Document/Page/Section
Source Version
```

---

# 17. Tool Selection Evaluation

必须评：

```text
用户问题
 -> 应该选什么 Tool
 -> 实际选什么 Tool
 -> 参数是否正确
```

指标：

- Tool Selection Accuracy；
- Tool Precision / Recall；
- Tool Argument Exact Match；
- Required Field Accuracy；
- Unknown Argument Rate；
- Scope Injection Attempt Block Rate；
- Unnecessary Tool Call Rate；
- Tool Sequence Accuracy。

关键安全 Case：

```text
查询问题不能走 mutation
图片提示不能直接 delete
Sandbox 不能调用 commit
Agent Loop 不能调用 critical tool
```

---

# 18. Working Memory Evaluation

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

指标：

- Reference Resolution Accuracy；
- Ordinal Accuracy；
- Project Isolation；
- Stale Context Leakage；
- Selected Rows Accuracy；
- Continue Token Accuracy；
- TTL Behavior；
- LLM_INFERENCE Persistence Rejection。

---

# 19. Mutation Evaluation

Mutation Eval 分三层：

## 19.1 Proposal Correctness

- target entity；
- before；
- after；
- changed fields；
- record version；
- digest。

## 19.2 Safety

指标必须包括：

- Wrong-target Rate；
- Scope Leakage；
- Confirmation Bypass；
- Approval Replay；
- Digest mismatch block；
- Version Conflict block；
- Hard Delete Rate；
- Unauthorized Commit Rate。

核心安全指标建议：

```text
Wrong-target Rate = 0
Confirmation Bypass = 0
Unauthorized Commit = 0
Approval Replay Success = 0
```

## 19.3 Finalization / Reconciliation

必须有 Fault Injection Case：

```text
DB commit success
audit failure
proposal finalization failure
network timeout after commit
```

检查：

- 是否误报 FAILED；
- 是否允许 unsafe retry；
- 是否进入 reconciliation。

---

# 20. Multimodal Evaluation

评估：

- MIME/signature validation；
- Observation extraction；
- OCR/text；
- bbox；
- Entity Resolution；
- required fields；
- low confidence；
- image prompt injection；
- delete intent safety。

指标：

- Observation precision/recall；
- field extraction accuracy；
- entity match；
- no-evidence action rejection；
- prompt injection block；
- wrong-target mutation rate。

---

# 21. Agent Loop Evaluation

评估：

```text
Plan
Act
Verify
Replan
Finish
```

指标：

- Task Success；
- Step Count；
- Tool Count；
- Token；
- Cost；
- latency；
- Replan Rate；
- Loop Exhaustion Rate；
- Usage Accounting Completeness；
- confirmation boundary correctness；
- timeout correctness。

特殊 Case：

```text
tool fails
planner malformed
verifier says replan
budget exhausted
usage incomplete
scope injection
critical tool requested
```

---

# 22. Report Evaluation

评估：

- Dataset schema；
- hidden field leakage；
- evidence completeness；
- lineage；
- artifact signature；
- active content；
- external links；
- PDF action；
- XLSX macro；
- SVG script；
- filename/path traversal；
- renderer timeout；
- artifact size。

指标：

```text
Evidence Coverage
Hidden Field Leakage = 0
Active Content Acceptance = 0
Invalid Signature Acceptance = 0
```

---

# 23. Sandbox Evaluation

分三类：

## 23.1 SQL Static Safety

Case：

```text
SELECT allowed
UPDATE reject
DELETE reject
DDL reject
SELECT * reject
LOAD_FILE reject
system schema reject
multi-statement reject
comment injection reject
```

## 23.2 Python Static Safety

Case：

```text
import reject
open reject
network reject
process reject
dynamic code reject
dynamic query-id reject
```

## 23.3 Runtime Attestation

检查：

- network disabled；
- filesystem disabled；
- process disabled；
- secret absent；
- actual source hash；
- broker timeout；
- query cost guard；
- row/payload limit。

---

# 24. Trace / Token / Cost Evaluation

这是很容易被遗漏、但生产必须有的评测。

检查：

- 每请求有 traceId；
- sequence_no 单调；
- LLM call count 正确；
- Tool call count 正确；
- retrieval event 完整；
- token sum consistency；
- cache token；
- reasoning token；
- cost；
- error captured；
- redaction；
- trace query latency。

指标：

```text
Trace Completeness
Token Accounting Accuracy
Tool Audit Completeness
Redaction Leak Rate
Trace Query P95
```

---

# 25. E2E Evaluation

至少保留 A–D：

## A

工程部位 + BOQ 查询。

## B

Working Memory + Mutation Confirmation。

## C

Project RAG + Citation。

## D

权威工程量事实回源。

新增第二阶段 E2E：

## E

图片 -> Observation -> Entity Review -> Prepare Mutation。

## F

复杂 Agent Loop -> Read Tools -> Report。

## G

Sandbox Analysis -> Broker -> Report。

每条 Critical E2E：

```text
必须逐条 PASS
```

不能被总体成功率平均掉。

---

# 26. Dataset Management Tool

页面：

```text
/industry/eval/datasets
```

功能：

- Dataset List；
- version；
- fingerprint；
- case count；
- reviewed status；
- tag distribution；
- domain distribution；
- import/export；
- duplicate detection；
- split；
- archive。

Case Editor：

- input；
- expected；
- tags；
- difficulty；
- critical；
- notes；
- label history；
- reviewer。

必须支持：

```text
Draft -> Review -> Reviewed
```

Golden Label 修改需要审计。

---

# 27. 从线上失败生成 Eval Case

Trace / Workspace 中增加：

```text
[Add to Eval]
```

流程：

```text
Production/Staging Trace
 -> Extract sanitized input/output
 -> Draft Eval Case
 -> Human labels expected result
 -> Review
 -> Dataset version bump
```

不能：

```text
线上失败 -> 自动写入 Golden expected
```

---

# 28. Failure Triage Tool

页面：

```text
/industry/eval/failures
```

聚合：

```text
Wrong Intent
Normalization
No Retrieval
Wrong Top1
Hard Negative
RAG Missing Evidence
Tool Selection
Tool Args
Memory
Mutation
Agent Budget
Report Safety
Sandbox Safety
```

支持：

- filter；
- tag；
- cluster；
- assign owner；
- disposition。

Disposition：

```text
BUG
DATASET_ERROR
LABEL_ERROR
EXPECTED_CHANGE
MODEL_LIMITATION
CONFIG_ISSUE
INFRA_FAILURE
FLAKY
```

如果是 LABEL_ERROR：

必须修改 Dataset version。

不能悄悄把失败标成 PASS。

---

# 29. Run Configuration Tool

启动 Eval 前配置：

```text
Dataset
Run Type
Environment
Git Commit
Prompt Version
Normalizer Version
Embedding
Index
RRF
Reranker
Tool Schema
Parser
Chunker
Model
Concurrency
Timeout
Budget
```

系统自动计算：

```text
configFingerprint
```

正式 Run 禁止匿名配置。

---

# 30. Baseline Management

Baseline 不是“最新一次成功”。

必须显式 accept。

页面：

```text
/industry/eval/baselines
```

显示：

- baseline run；
- commit；
- dataset；
- fingerprint；
- metrics；
- reviewer；
- acceptedAt；
- reason。

Accept Baseline 权限：

```text
eval.baseline.accept
```

要求：

- Run Completed；
- Full coverage；
- Gate PASS；
- dataset Reviewed；
- no critical E2E failure；
- no invalid sample。

Baseline 修改必须写 Control Plane Audit。

---

# 31. Compare Tool

页面：

```text
/industry/eval/compare?baseline=...&candidate=...
```

三层：

## Summary

```text
Metric
Baseline
Candidate
Delta
Threshold
Status
```

## Domain

```text
Intent
Retrieval
RAG
Tool
Mutation
...
```

## Case

```text
Improved
Regressed
Changed but still pass
New failure
Recovered failure
```

Retrieval Case 还显示：

```text
rank movement
candidate movement
score movement
```

---

# 32. Release Gate Tool

页面：

```text
/industry/eval/release-gate
```

展示：

```text
Candidate commit
Dataset fingerprint
Coverage
Required Metrics
Regression Rules
Critical E2E
Component version bump
Gate Result
```

状态：

```text
PASS
BLOCKED
INVALID
RUNNING
```

用户不能手工覆盖 Gate 结果。

如果业务确需 exception：

必须是独立的：

```text
Release Waiver
```

字段：

```text
reason
scope
expiry
approver
linked issue
```

不能把 waiver 改成 Gate PASS。

---

# 32.1 Dataset Split 与评测泄漏控制

正式评测数据至少分为：

```text
DEV
  = 研发期可反复查看和调参

REGRESSION
  = 常规 PR / Nightly 回归

RELEASE_HOLDOUT
  = 发布资格集，限制查看和修改
```

原则：

1. Prompt、Embedding、RRF、Reranker 调参主要使用 DEV；
2. REGRESSION 用于持续回归；
3. RELEASE_HOLDOUT 不能成为日常调参集；
4. Holdout label 修改需要高权限 Review 和 dataset version bump；
5. Baseline/Candidate 正式发布比较必须记录使用了哪个 split。

平台必须提供 Leakage Check：

- exact duplicate；
- normalized duplicate；
- near duplicate；
- same source paragraph；
- same entity + template paraphrase；
- train/dev/test crossover。

如果发现明显泄漏：

```text
Eval Run = INVALID_DATASET
```

不能继续当作有效 Gate 结果。

对于通过 LLM 自动扩写得到的 synthetic case，应记录：

```text
source case
generator model
generator prompt version
generatedAt
human reviewed
```

Synthetic case 不能自动进入 RELEASE_HOLDOUT。

---

# 32.2 Statistical Confidence / A-B 可信度

Embedding、Reranker、Prompt、Parser 等 A/B 对比不能只显示 point estimate。

Compare Tool 应支持：

- paired case comparison；
- bootstrap confidence interval；
- win / loss / tie；
- minimum sample size；
- metric confidence interval；
- critical case exact result。

示例：

```text
Recall@20
Baseline: 0.912
Candidate: 0.919
Delta: +0.007
95% CI: [-0.002, +0.015]
Decision: INCONCLUSIVE
```

如果区间跨过 0：

```text
不能自动标记为“显著提升”
```

Release Gate 仍以配置好的 deterministic threshold / regression rule 为准，但 UI 必须标注统计不确定性。

对于安全指标：

```text
ACL Leakage
Mutation Wrong-target
Confirmation Bypass
Unauthorized Commit
SQL Write Acceptance
Secret Leakage
```

不采用“统计上差不多”。

这些指标是硬约束：

```text
出现一次即可触发 BLOCK（按 gate policy）。
```

---

# 32.3 Evaluation Reproducibility Snapshot

每次正式 Run 除 ComponentVersionSnapshot 外，还要保存环境快照：

```text
node/runtime version
OS/container image digest
model endpoint/version
OpenSearch index UUID/version
dataset fingerprint
config fingerprint
git commit
timezone
locale
concurrency
timeout
budget
seed
```

如果无法获得关键版本：

```text
reproducibilityStatus = INCOMPLETE
```

`INCOMPLETE` Run 可以用于研发分析，但默认不能成为 accepted baseline。

---

# 32.4 Dataset Health Dashboard

Dataset 页面增加质量指标：

```text
Total Cases
Reviewed %
Critical Cases
Hard Cases
Adversarial Cases
Tag Coverage
Intent Distribution
Query Type Distribution
Duplicate Count
Near-Duplicate Count
Holdout Leakage
Label Churn
Last Review Age
```

目的是防止出现：

```text
“模型分数很高，只是因为测试集太简单/重复/分布失真”
```

Dataset Health 本身是 Release Readiness 的输入之一。

---

# 33. Online Quality Monitoring

后续阶段可以新增，但数据模型现在就要预留。

监控：

- intent distribution drift；
- clarification rate；
- zero retrieval；
- low confidence；
- tool error；
- mutation rejection；
- RAG insufficient evidence；
- latency；
- token/cost；
- user correction signal。

Online Dashboard 只能发现问题。

它不是正式 Release Gate。

---

# 34. Human Review Tool

部分指标需要人工。

例如：

- Answer Relevance；
- Groundedness；
- Image observation quality；
- report narrative quality。

Review Queue：

```text
Pending Review
Reviewer
Blind baseline/candidate mode
Rubric
Score
Notes
```

建议支持 blind A/B：

避免 reviewer 先看到“Candidate”标签导致偏差。

---

# 35. LLM-as-Judge

可以使用，但不能成为唯一评价依据。

必须：

- judge model/version 固定；
- judge prompt version 固定；
- rubric version；
- sample calibration；
- human spot check。

禁止：

```text
被测模型 == Judge 且没有任何人工/规则校验
```

安全指标不能依赖 LLM Judge：

```text
ACL leakage
mutation bypass
secret leakage
SQL write acceptance
```

这些必须 deterministic。

---

# 36. pi-web 前端设计

建议新增：

```text
web/src/features/eval/
  EvalOverviewPage.tsx
  IntentEvalPage.tsx
  RetrievalEvalPage.tsx
  RagEvalPage.tsx
  ToolEvalPage.tsx
  SafetyEvalPage.tsx

  DatasetListPage.tsx
  DatasetDetailPage.tsx
  CaseEditor.tsx

  RunListPage.tsx
  RunDetailPage.tsx
  RunConfigForm.tsx

  ComparePage.tsx
  FailureExplorerPage.tsx
  BaselinePage.tsx
  ReleaseGatePage.tsx
  ReviewQueuePage.tsx

  components/
    MetricCard.tsx
    MetricTable.tsx
    ConfusionMatrix.tsx
    RankMovementTable.tsx
    RetrievalCandidateTable.tsx
    FailureCluster.tsx
    VersionSnapshot.tsx
    CaseDiff.tsx
```

---

# 37. pi-web Server 设计

建议：

```text
server/src/industry/routes/eval/
  datasets.ts
  cases.ts
  runs.ts
  compare.ts
  baselines.ts
  gate.ts
  reviews.ts
  playground.ts
  online-quality.ts
```

BFF 只负责：

- auth；
- authorization；
- request validation；
- job orchestration；
- file import/export；
- result streaming；
- pagination；
- safe proxy。

指标计算仍在 `pi`。

---

# 38. API 设计

Base：

```text
/api/industry/v1/eval
```

## Dataset

```text
GET    /datasets
POST   /datasets
GET    /datasets/:datasetId
POST   /datasets/:datasetId/versions
GET    /datasets/:datasetId/cases
POST   /datasets/:datasetId/cases
PATCH  /datasets/:datasetId/cases/:caseId
POST   /datasets/:datasetId/review
POST   /datasets/:datasetId/import
GET    /datasets/:datasetId/export
```

## Run

```text
GET    /runs
POST   /runs
GET    /runs/:runId
POST   /runs/:runId/cancel
GET    /runs/:runId/observations
GET    /runs/:runId/failures
GET    /runs/:runId/artifacts
```

## Compare

```text
POST /compare
GET  /comparisons/:comparisonId
```

## Baseline

```text
GET  /baselines
POST /baselines/:runId/accept
POST /baselines/:baselineId/archive
```

## Gate

```text
GET  /release-gate
POST /release-gate/evaluate
```

## Playground

```text
POST /playground/intent
POST /playground/retrieval
POST /playground/rag
```

Playground 默认：

```text
not persisted
```

除非用户显式 Save as Case。

---

# 39. Long-running Eval Job

评测不是普通同步 HTTP。

流程：

```text
POST /runs
 -> runId

Run Queue
 -> Worker

Worker
 -> pi OfflineEvalExecutor

Observations
 -> Metrics
 -> Artifacts

Event Stream
 -> pi-web
```

事件：

```text
eval_run_started
eval_case_started
eval_case_completed
eval_case_failed
eval_metric_updated
eval_run_completed
eval_run_failed
```

Event 必须：

- eventId；
- sequenceNo；
- runId；
- timestamp。

---

# 40. Artifact

Eval Artifact 可包括：

```text
confusion-matrix.json
failed-cases.json
retrieval-ranking.json
comparison.json
benchmark-report.json
gate-report.json
trace-refs.json
```

大 Artifact 不直接塞 WebSocket。

---

# 41. 权限模型

建议：

```text
eval.read
eval.run
eval.dataset.create
eval.dataset.edit
eval.dataset.review
eval.baseline.accept
eval.gate.read
eval.review
eval.playground
eval.admin
```

普通业务用户不一定需要看到：

- Prompt；
- Retrieval debug；
- full Tool args；
- corpus sensitive sample。

---

# 42. 安全要求

## 42.1 Eval 也必须 Scope-aware

如果 Eval Dataset 带项目数据：

- tenant；
- company；
- project；
- security tag；

都要绑定。

## 42.2 Secret

Observation / Artifact 中禁止：

- API key；
- Authorization；
- DB DSN；
- Approval Token；
- cookie；
- raw secret。

## 42.3 Prompt Injection

Eval Case 本身是不可信数据。

管理页不能：

- raw HTML；
- execute script；
- 把 Tool output 当控制指令。

## 42.4 Mutation

Mutation Eval 默认使用：

```text
in-memory / fixture / dedicated safe test adapter
```

在没有 `DB_EXECUTION_APPROVAL` 前不能真实写库。

---

# 43. 数据持久化规划

当前阶段数据库仍不可连接执行。

先定义 Port：

```ts
interface EvalRepository {
  createDataset(...)
  saveCase(...)
  createRun(...)
  saveObservation(...)
  saveComparison(...)
  saveBaseline(...)
  saveReview(...)
}
```

Phase 0 可实现：

```text
File-backed
InMemory
```

生产阶段再实现 MySQL Adapter。

SQL 只生成 migration 文件，不执行。

---

# 44. CI 集成

至少分三层：

## PR Fast Eval

```text
Intent smoke
Normalization
Tool safety
Critical mutation
Small retrieval sample
```

目标：

```text
< 10 min
```

## Nightly Full Eval

```text
1030 corpus
M9-M12
all domain eval
```

## Release Candidate

```text
full corpus
real adapters/staging
critical E2E
performance
security
release gate
```

---

# 45. 版本升级规则

任何以下变化：

```text
Prompt
Intent parser
Normalizer
Embedding
Index mapping
Chunker
Parser
RRF
Reranker
Tool schema
Mutation policy
RAG ACL policy
Report policy
Sandbox policy
```

必须：

```text
version bump
 -> benchmark
 -> comparison
 -> gate
```

pi-web 要把 version diff 展示出来。

---

# 46. Error Taxonomy

Eval Run Failure 不能只写：

```text
FAILED
```

至少区分：

```text
EXECUTOR_ERROR
INFRA_ERROR
TIMEOUT
INVALID_DATASET
CASE_ERROR
MODEL_ERROR
INDEX_ERROR
AUTH_ERROR
BUDGET_EXCEEDED
CANCELLED
```

Metric failure 和 Infrastructure failure 必须分开。

---

# 47. 性能指标

Eval 系统自己也要测：

- cases/sec；
- run wall time；
- executor concurrency；
- model latency；
- vector search latency；
- reranker latency；
- artifact size；
- queue wait；
- failure retry。

但 Infra retry 不能自动改变 Observation 语义。

---

# 48. 评测首页

Overview 建议展示：

```text
Current Baseline
Latest Candidate
Release Gate
Dataset Health
Latest Regressions
Critical Failures
Intent F1
Retrieval Recall@20
RAG nDCG
Tool Accuracy
Mutation Safety
E2E Pass
```

但禁止只有大盘。

每一个指标都必须可点击进入 Case 级分析。

---

# 49. 最重要的两套专项工具

## 49.1 Intent Lab

用户使用流程：

```text
输入问题
 -> 看 Intent
 -> 看 SemanticFrame
 -> 加 Expected Label
 -> Save Case
 -> Batch Run
 -> Confusion Matrix
 -> Compare Prompt
```

## 49.2 Retrieval Lab

用户使用流程：

```text
输入 query
 -> 看 Exact/BM25/Dense
 -> 看 RRF
 -> 看 Rerank
 -> 看 Final
 -> 标 Relevant / Not Relevant
 -> Save Case
 -> A/B embedding/reranker
 -> Benchmark
```

这两套工具必须先于“漂亮的 Release Dashboard”。

---

# 50. 数据标注辅助

Retrieval Lab 允许管理员：

```text
Relevant
Highly Relevant
Not Relevant
Hard Negative
```

Intent Lab：

```text
Correct Intent
Acceptable Intent
Must Not Intent
```

所有 label modification：

- reviewer；
- timestamp；
- previous value；
- new value；
- reason。

---

# 51. 评测资产目录规划

`pi` 继续保留正式机器可执行资产：

```text
evals/industry-agent/
```

`pi-web` 不复制正式 corpus。

pi-web 本身保存：

```text
docs/design-docs/
```

以及 Web 侧 fixture：

```text
test/fixtures/eval-ui/
```

正式 Dataset 通过 Eval API 获取。

---

# 52. Cross-repo Contract

需要版本化：

```text
eval-api-v1
eval-event-v1
eval-case-v1
eval-observation-v1
benchmark-report-v1
release-gate-report-v1
```

pi 与 pi-web 都跑 Contract Fixture。

---

# 53. 实施阶段

# Eval Phase 0：基础框架

实现：

- Eval navigation；
- shared contract；
- BFF mock；
- Dataset/Run/Metric common model；
- mock EvalRepository；
- Overview empty state。

不接真实 Executor。

---

# Eval Phase 1：Intent Lab

实现：

- Intent Dataset；
- Case Editor；
- Intent Playground；
- Batch Run；
- Accuracy/F1；
- Confusion Matrix；
- Failure filter；
- Baseline/Candidate compare。

这是第一优先级。

---

# Eval Phase 2：Retrieval Lab

实现：

- Engineering Retrieval；
- BOQ Retrieval；
- Dense/BM25/RRF/Rerank 分层；
- Recall/MRR/nDCG；
- Rank Movement；
- Hard Negative；
- A/B Embedding；
- A/B Reranker。

这是第二优先级。

---

# Eval Phase 3：Semantic / Entity / Tool

实现：

- Normalization；
- Entity Resolution；
- Tool Selection；
- Tool Args；
- Scope/Safety。

---

# Eval Phase 4：RAG

实现：

- RAG Retrieval；
- Answer；
- Citation；
- ACL；
- Groundedness；
- Human/LLM Judge。

---

# Eval Phase 5：Safety / Stateful

实现：

- Memory；
- Mutation；
- Multimodal；
- Agent Loop；
- Report；
- Sandbox；
- Trace/Token。

---

# Eval Phase 6：Unified Benchmark

接 Phase 11：

- 1030 Corpus；
- M9-M12；
- full benchmark；
- baseline；
- comparison；
- release gate。

---

# Eval Phase 7：Online Quality

实现：

- production sampling；
- drift；
- user correction；
- add-to-eval workflow。

---

# 54. 每阶段 DoD

每个 Eval Phase：

```text
Contract
 -> Dataset
 -> Executor
 -> Metrics
 -> UI
 -> Failure Drilldown
 -> Tests
 -> Security Review
 -> Self Review
 -> Fix
 -> Second Review
 -> Acceptance
```

不能只有图表，没有：

```text
case-level failure
version
trace
reproducibility
```

---

# 55. 第一批开发任务

下一次开发建议只做 **Eval Phase 0 + Phase 1 骨架**，不要一次实现全部。

具体：

1. 创建 `shared/industry/eval/`；
2. 定义 EvalDataset / EvalCase / EvalRun / Observation；
3. 创建 `/industry/eval` 路由；
4. 创建 Eval Overview；
5. 创建 Intent Dataset List；
6. 创建 Intent Case Detail；
7. 创建 Intent Playground UI；
8. Server 增加 `/api/industry/v1/eval/*` mock routes；
9. 定义 `EvaluationClient`；
10. Mock Intent Executor；
11. 先接 fixture；
12. 实现 Accuracy；
13. 展示 F1（由 mock/API 返回，不在 Web 重算正式口径）；
14. Confusion Matrix；
15. Failed Cases；
16. Compare 页面骨架；
17. Scope/权限测试；
18. Secret/Prompt 安全展示测试；
19. Web test；
20. Server test；
21. 两轮审查；
22. 验收后进入 Retrieval Lab。

---

# 56. 与 Industry Control Plane 总设计的关系

Evaluation 是：

```text
Industry Control Plane
  ├─ Workspace
  ├─ Mutation
  ├─ Knowledge
  ├─ Trace
  ├─ Retrieval Debug
  ├─ Evaluation       <- 一级系统
  ├─ Report
  ├─ Sandbox
  ├─ Runtime
  └─ Operations
```

Retrieval Debug 和 Retrieval Eval 的区别：

```text
Retrieval Debug
  = 单次问题调试

Retrieval Eval
  = Dataset + Batch + Metric + Compare + Regression
```

Intent Playground 和 Intent Eval 同理。

---

# 57. 两轮规划审查

## 57.1 第一轮：覆盖度审查

发现：

原 Control Plane 设计虽然有 `Eval & Release Gate`，但粒度不足，容易最终只实现：

```text
Run 1030 corpus
Show metrics
PASS/BLOCK
```

这无法支持开发过程中定位：

- Intent 误判；
- Dense 召回问题；
- Hard Negative；
- Reranker 排序回退。

修正：

1. Evaluation 提升为一级子系统；
2. 增加 Intent Lab；
3. 增加 Retrieval Lab；
4. 把 Exact/BM25/Dense/RRF/Rerank 拆层展示；
5. 增加 Embedding A/B；
6. 增加 Reranker A/B；
7. 所有 Aggregate Metric 必须能 drill down 到 Case。

结论：

**PASS WITH FIXES**

---

## 57.2 第二轮：完整性与安全审查

检查模块：

```text
Intent
Normalization
Entity
Retrieval
RAG
Tool
Memory
Mutation
Multimodal
Agent Loop
Report
Sandbox
Trace/Token
E2E
```

发现 1：

只做 Offline Eval 会漏掉真实线上分布漂移。

修正：

- 预留 Online Quality；
- 线上样本只能成为 Draft Case，不能自动成为 Golden。

发现 2：

LLM-as-Judge 容易把安全指标“软化”。

修正：

- ACL/Mutation/SQL/Secret 等安全指标 deterministic；
- Judge 只用于语义质量指标。

发现 3：

Baseline 如果自动取 latest，可能把坏结果当基线。

修正：

- Baseline 必须显式 accept；
- 需要权限和 Audit。

发现 4：

Eval 自身可能泄露真实数据。

修正：

- Dataset Scope；
- redaction；
- secret ban；
- production sampling human review。

发现 5：

Browser 重算指标会和 pi 口径漂移。

修正：

- 正式 Metric / Gate 只由 pi 计算；
- pi-web 只展示。

第二轮结论：

**PASS**

---

# 58. 最终判定

评测平台属于 Industry Agent 能够长期演进的**必需基础设施**。

第一优先级必须保证：

```text
Intent Evaluation Tool
Vector / Hybrid Retrieval Evaluation Tool
```

随后覆盖：

```text
Normalization
Entity
RAG
Tool
Memory
Mutation
Multimodal
Agent Loop
Report
Sandbox
Trace/Token
E2E
```

最终形成：

```text
专项实验室
 + Dataset
 + Batch Run
 + Metrics
 + Failure Explorer
 + Baseline
 + Comparison
 + Release Gate
 + Online Quality Feedback Loop
```

而不是只做一个“跑分页面”。

---

# 59. 数据库边界

本设计阶段：

```text
MySQL connection        NOT AUTHORIZED
Migration execution     NOT AUTHORIZED
DDL execution           NOT AUTHORIZED
DML execution           NOT AUTHORIZED
Real mutation commit    NOT AUTHORIZED
```

Eval Phase 0–2 可以完全使用：

- Mock EvaluationClient；
- fixture；
- File-backed repository；
- InMemory repository；
- existing deterministic corpus builder。

真实 Staging Adapter 需要后续按生产资格验证计划逐 Gate 接入。
