import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  RetrievalCandidate,
  RetrievalComparisonType,
  RetrievalDomain,
  RetrievalEvalCase,
  RetrievalLeakageReport,
  RetrievalPlaygroundResult,
  RetrievalRunComparison,
  RetrievalRunSummary,
  RetrievalStage,
  RetrievalStageSnapshot,
} from '../../../../shared/industry/eval/retrieval'
import { RETRIEVAL_STAGE_ORDER } from '../../../../shared/industry/eval/retrieval'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()
const RETRIEVAL_DATASET_ID = 'retrieval-regression-v1'
const STAGE_LABELS: Record<RetrievalStage, string> = {
  SEMANTIC_PARSE: '语义解析',
  HARD_FILTERS: '硬过滤',
  EXACT: '精确',
  BM25: 'BM25',
  DENSE: '密集',
  ENTITY_AWARE: '实体感知',
  RRF: 'RRF',
  RERANKER: '重排器',
  BUSINESS_FEATURE: '业务特征',
  FINAL: '最终',
}

export interface RetrievalLabSnapshot {
  cases: readonly RetrievalEvalCase[]
  leakageReport: RetrievalLeakageReport
  runs: readonly RetrievalRunSummary[]
  result?: RetrievalPlaygroundResult
  comparison?: RetrievalRunComparison
}

export function RetrievalLabPage({
  client = defaultEvaluationClient,
  initialSnapshot,
}: {
  client?: EvaluationApiClient
  initialSnapshot?: RetrievalLabSnapshot
}) {
  const [snapshot, setSnapshot] = useState<RetrievalLabSnapshot | undefined>(initialSnapshot)
  const [domain, setDomain] = useState<RetrievalDomain>(initialSnapshot?.result?.queryContext.domain ?? initialSnapshot?.cases[0]?.domain ?? 'ENGINEERING')
  const [selectedCaseId, setSelectedCaseId] = useState(initialSnapshot?.result?.caseId ?? initialSnapshot?.cases[0]?.caseId ?? '')
  const [query, setQuery] = useState(initialSnapshot?.result?.queryContext.query ?? initialSnapshot?.cases[0]?.queryContext.query ?? '')
  const [variantId, setVariantId] = useState(initialSnapshot?.result?.variantId ?? 'retrieval-stable-v1')
  const [selectedStage, setSelectedStage] = useState<RetrievalStage>('FINAL')
  const [baselineRunId, setBaselineRunId] = useState(initialSnapshot === undefined ? '' : preferredRunId(initialSnapshot.runs, 'retrieval-stable-v1'))
  const [candidateRunId, setCandidateRunId] = useState(initialSnapshot === undefined ? '' : preferredRunId(initialSnapshot.runs, 'retrieval-candidate-v2'))
  const [comparisonType, setComparisonType] = useState<RetrievalComparisonType>('CONFIG')
  const [running, setRunning] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void Promise.all([client.listRetrievalCases(), client.getRetrievalLeakageReport(), client.listRetrievalRuns()])
      .then(([cases, leakageReport, runs]) => {
        if (cancelled) return
        const first = cases[0]
        setSnapshot({ cases, leakageReport, runs })
        setBaselineRunId(preferredRunId(runs, 'retrieval-stable-v1'))
        setCandidateRunId(preferredRunId(runs, 'retrieval-candidate-v2'))
        if (first !== undefined) {
          setSelectedCaseId(first.caseId)
          setDomain(first.domain)
          setQuery(first.queryContext.query)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSnapshot])

  async function runPlayground(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (query.trim() === '') return
    setRunning(true)
    setError(null)
    try {
      const result = await client.playgroundRetrieval({ query: query.trim(), domain, variantId })
      setSnapshot((current) => current === undefined ? current : { ...current, result })
      setSelectedStage('FINAL')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setRunning(false)
    }
  }

  async function startBatchRun(): Promise<void> {
    setBatchRunning(true)
    setError(null)
    try {
      const created = await client.startRetrievalRun({ datasetId: RETRIEVAL_DATASET_ID, variantId })
      setSnapshot((current) => current === undefined ? current : {
        ...current,
        runs: [created, ...current.runs.filter((run) => run.runId !== created.runId)],
      })
      if (created.variantId === 'retrieval-stable-v1') setBaselineRunId(created.runId)
      if (created.variantId === 'retrieval-candidate-v2') setCandidateRunId(created.runId)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBatchRunning(false)
    }
  }

  async function compareRuns(): Promise<void> {
    if (baselineRunId === '' || candidateRunId === '') return
    setComparing(true)
    setError(null)
    try {
      const comparison = await client.compareRetrievalRuns(baselineRunId, candidateRunId, comparisonType)
      setSnapshot((current) => current === undefined ? current : { ...current, comparison })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setComparing(false)
    }
  }

  function clearResult(): void {
    setSnapshot((current) => current === undefined ? current : { ...current, result: undefined })
    setSelectedStage('FINAL')
    setError(null)
  }

  function changeDomain(nextDomain: RetrievalDomain): void {
    if (nextDomain === domain) return
    const first = snapshot?.cases.find((item) => item.domain === nextDomain)
    setDomain(nextDomain)
    setSelectedCaseId(first?.caseId ?? '')
    setQuery(first?.queryContext.query ?? '')
    clearResult()
  }

  function selectCase(caseId: string): void {
    const testCase = snapshot?.cases.find((item) => item.caseId === caseId)
    if (testCase === undefined) return
    setSelectedCaseId(testCase.caseId)
    setDomain(testCase.domain)
    setQuery(testCase.queryContext.query)
    clearResult()
  }

  if (error !== null && snapshot === undefined) {
    return <main className="eval-page"><h1>检索实验</h1><p className="eval-error" role="alert">{error}</p></main>
  }
  if (snapshot === undefined) return <main className="eval-page"><h1>检索实验</h1><p>加载检索夹具中…</p></main>

  return (
    <RetrievalLabView
      snapshot={snapshot}
      domain={domain}
      selectedCaseId={selectedCaseId}
      query={query}
      variantId={variantId}
      selectedStage={selectedStage}
      baselineRunId={baselineRunId}
      candidateRunId={candidateRunId}
      comparisonType={comparisonType}
      running={running}
      batchRunning={batchRunning}
      comparing={comparing}
      error={error}
      onDomainChange={changeDomain}
      onCaseSelect={selectCase}
      onQueryChange={setQuery}
      onVariantChange={setVariantId}
      onStageSelect={setSelectedStage}
      onBaselineRunChange={setBaselineRunId}
      onCandidateRunChange={setCandidateRunId}
      onComparisonTypeChange={setComparisonType}
      onSubmit={(event) => void runPlayground(event)}
      onStartBatch={() => void startBatchRun()}
      onCompare={() => void compareRuns()}
    />
  )
}

export function RetrievalLabView({
  snapshot,
  domain,
  selectedCaseId,
  query,
  variantId,
  selectedStage,
  baselineRunId,
  candidateRunId,
  comparisonType,
  running,
  batchRunning,
  comparing,
  error,
  onDomainChange = () => undefined,
  onCaseSelect = () => undefined,
  onQueryChange = () => undefined,
  onVariantChange = () => undefined,
  onStageSelect = () => undefined,
  onBaselineRunChange = () => undefined,
  onCandidateRunChange = () => undefined,
  onComparisonTypeChange = () => undefined,
  onSubmit = (event) => event.preventDefault(),
  onStartBatch = () => undefined,
  onCompare = () => undefined,
}: {
  snapshot: RetrievalLabSnapshot
  domain: RetrievalDomain
  selectedCaseId: string
  query: string
  variantId: string
  selectedStage: RetrievalStage
  baselineRunId: string
  candidateRunId: string
  comparisonType: RetrievalComparisonType
  running: boolean
  batchRunning: boolean
  comparing: boolean
  error: string | null
  onDomainChange?: (domain: RetrievalDomain) => void
  onCaseSelect?: (caseId: string) => void
  onQueryChange?: (query: string) => void
  onVariantChange?: (variantId: string) => void
  onStageSelect?: (stage: RetrievalStage) => void
  onBaselineRunChange?: (runId: string) => void
  onCandidateRunChange?: (runId: string) => void
  onComparisonTypeChange?: (type: RetrievalComparisonType) => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onStartBatch?: () => void
  onCompare?: () => void
}) {
  const filteredCases = useMemo(() => snapshot.cases.filter((item) => item.domain === domain), [snapshot.cases, domain])
  const selectedCase = snapshot.cases.find((item) => item.caseId === selectedCaseId)
  const selectedSnapshot = snapshot.result?.stages.find((stage) => stage.stage === selectedStage)

  return (
    <main className="eval-page" aria-labelledby="retrieval-lab-title">
      <div className="eval-eyebrow">评测工作台 · P2</div>
      <div className="eval-heading-row">
        <div>
          <h1 id="retrieval-lab-title">检索实验</h1>
          <p>工程 / BOQ 混合检索夹具工作台。每个检索层均可查看;不使用真实的 OpenSearch 或模型调用。</p>
        </div>
        <a className="eval-primary-link" href="/industry/eval/intent">意图实验</a>
      </div>

      {error === null ? null : <p className="eval-error" role="alert">{error}</p>}

      <section className="eval-panel">
        <div className="eval-form-row">
          <label>
            领域
            <select value={domain} onChange={(event) => onDomainChange(event.target.value as RetrievalDomain)}>
              <option value="ENGINEERING">工程</option>
              <option value="BOQ">BOQ</option>
            </select>
          </label>
          <label>
            夹具用例
            <select value={selectedCaseId} onChange={(event) => onCaseSelect(event.target.value)}>
              {filteredCases.map((testCase) => <option value={testCase.caseId} key={testCase.caseId}>{testCase.caseId}</option>)}
            </select>
          </label>
          <label>
            变体
            <select value={variantId} onChange={(event) => onVariantChange(event.target.value)}>
              <option value="retrieval-stable-v1">稳定 v1</option>
              <option value="retrieval-candidate-v2">候选 v2</option>
            </select>
          </label>
        </div>

        <form className="eval-retrieval-query" onSubmit={onSubmit}>
          <label>
            查询
            <textarea rows={3} value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </label>
          <button type="submit" disabled={running || query.trim() === ''}>{running ? '运行中…' : '运行检索'}</button>
        </form>

        {selectedCase === undefined ? null : <CaseExpectation testCase={selectedCase} />}
      </section>

      {snapshot.result === undefined ? (
        <section className="eval-panel"><h2>层级查看</h2><p>运行夹具查询以查看每个检索阶段。</p></section>
      ) : (
        <>
          <SemanticParsePanel result={snapshot.result} />
          <StageNavigator result={snapshot.result} selectedStage={selectedStage} onStageSelect={onStageSelect} />
          <StageDetail snapshot={selectedSnapshot} />
        </>
      )}

      <BatchRunPanel
        runs={snapshot.runs}
        variantId={variantId}
        baselineRunId={baselineRunId}
        candidateRunId={candidateRunId}
        comparisonType={comparisonType}
        comparison={snapshot.comparison}
        batchRunning={batchRunning}
        comparing={comparing}
        onStartBatch={onStartBatch}
        onBaselineRunChange={onBaselineRunChange}
        onCandidateRunChange={onCandidateRunChange}
        onComparisonTypeChange={onComparisonTypeChange}
        onCompare={onCompare}
      />

      <LeakagePanel report={snapshot.leakageReport} />
    </main>
  )
}

function CaseExpectation({ testCase }: { testCase: RetrievalEvalCase }) {
  return (
    <div className="eval-retrieval-expectation">
      <strong>期望</strong>
      <span>相关: {testCase.expected.relevantEntityIds.join(', ')}</span>
      <span>硬负例: {testCase.expected.hardNegativeEntityIds.join(', ')}</span>
      <span>划分: {testCase.split}</span>
      <div className="eval-tags">{testCase.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </div>
  )
}

function SemanticParsePanel({ result }: { result: RetrievalPlaygroundResult }) {
  const entries = Object.entries(result.queryContext).filter(([, value]) => value !== undefined)
  return (
    <section className="eval-panel">
      <div className="eval-panel-heading">
        <h2>语义解析</h2>
        <code>{result.traceId}</code>
      </div>
      <dl className="eval-retrieval-context">
        {entries.map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(' / ') : String(value)}</dd></div>
        ))}
      </dl>
    </section>
  )
}

function StageNavigator({
  result,
  selectedStage,
  onStageSelect,
}: {
  result: RetrievalPlaygroundResult
  selectedStage: RetrievalStage
  onStageSelect: (stage: RetrievalStage) => void
}) {
  return (
    <section className="eval-panel">
      <h2>检索管道</h2>
      <div className="eval-stage-grid" aria-label="检索阶段">
        {RETRIEVAL_STAGE_ORDER.map((stage, index) => {
          const stageSnapshot = result.stages.find((item) => item.stage === stage)
          return (
            <button
              type="button"
              key={stage}
              data-selected={stage === selectedStage}
              onClick={() => onStageSelect(stage)}
            >
              <span>{index + 1}</span>
              <strong>{STAGE_LABELS[stage]}</strong>
              <small>{stageSnapshot?.candidates.length ?? 0} 候选</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function StageDetail({ snapshot }: { snapshot: RetrievalStageSnapshot | undefined }) {
  if (snapshot === undefined) return <section className="eval-panel"><p>暂无阶段数据。</p></section>
  return (
    <section className="eval-panel" aria-labelledby="retrieval-stage-title">
      <div className="eval-panel-heading">
        <h2 id="retrieval-stage-title">{STAGE_LABELS[snapshot.stage]}</h2>
        <span className="eval-muted">{snapshot.candidates.length} 候选</span>
      </div>
      {snapshot.notes?.map((note) => <p className="eval-muted" key={note}>{note}</p>)}
      {snapshot.removedEntityIds === undefined || snapshot.removedEntityIds.length === 0 ? null : (
        <p className="eval-retrieval-removed"><strong>硬过滤移除:</strong> {snapshot.removedEntityIds.join(', ')}</p>
      )}
      {snapshot.candidates.length === 0 ? <p>此阶段无排序候选。</p> : <CandidateTable candidates={snapshot.candidates} />}
    </section>
  )
}

function CandidateTable({ candidates }: { candidates: readonly RetrievalCandidate[] }) {
  return (
    <div className="eval-scroll">
      <table className="eval-table eval-retrieval-table">
        <thead>
          <tr>
            <th>排名</th><th>实体</th><th>名称</th><th>标志</th><th>源分支</th>
            <th>精确</th><th>BM25</th><th>密集</th><th>实体</th><th>RRF</th><th>重排</th><th>业务</th><th>最终</th><th>原因</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.entityId} data-hard-negative={candidate.hardNegative === true}>
              <td>{candidate.rank}</td>
              <td><code>{candidate.entityId}</code></td>
              <td>{candidate.name}</td>
              <td><CandidateFlags candidate={candidate} /></td>
              <td>{candidate.sourceArm.join(' + ')}</td>
              <Score value={candidate.exactScore} />
              <Score value={candidate.bm25Score} />
              <Score value={candidate.denseScore} />
              <Score value={candidate.entityAwareScore} />
              <Score value={candidate.rrfScore} />
              <Score value={candidate.rerankScore} />
              <Score value={candidate.businessScore} />
              <Score value={candidate.finalScore} />
              <td>{candidate.reason.join('；')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CandidateFlags({ candidate }: { candidate: RetrievalCandidate }) {
  if (!candidate.hardNegative && !candidate.criticalSpecConflict) return <span className="eval-muted">—</span>
  return (
    <div className="eval-candidate-flags">
      {candidate.hardNegative ? <span data-kind="warning">硬负例</span> : null}
      {candidate.criticalSpecConflict ? <span data-kind="danger">关键规格冲突</span> : null}
    </div>
  )
}

function Score({ value }: { value: number | undefined }) {
  return <td>{value === undefined ? '—' : value.toFixed(4)}</td>
}

function BatchRunPanel({
  runs,
  variantId,
  baselineRunId,
  candidateRunId,
  comparisonType,
  comparison,
  batchRunning,
  comparing,
  onStartBatch,
  onBaselineRunChange,
  onCandidateRunChange,
  onComparisonTypeChange,
  onCompare,
}: {
  runs: readonly RetrievalRunSummary[]
  variantId: string
  baselineRunId: string
  candidateRunId: string
  comparisonType: RetrievalComparisonType
  comparison: RetrievalRunComparison | undefined
  batchRunning: boolean
  comparing: boolean
  onStartBatch: () => void
  onBaselineRunChange: (runId: string) => void
  onCandidateRunChange: (runId: string) => void
  onComparisonTypeChange: (type: RetrievalComparisonType) => void
  onCompare: () => void
}) {
  return (
    <section className="eval-panel">
      <div className="eval-panel-heading">
        <div>
          <h2>批次运行与指标</h2>
          <p>正式指标值由评测服务返回。UI 仅展示这些值。</p>
        </div>
        <button type="button" disabled={batchRunning} onClick={onStartBatch}>
          {batchRunning ? '批次运行中…' : `运行 ${variantId}`}
        </button>
      </div>
      <RetrievalMetricsTable runs={runs} />

      <div className="eval-compare-controls">
        <label>基线
          <select value={baselineRunId} onChange={(event) => onBaselineRunChange(event.target.value)}>
            {runs.map((run) => <option value={run.runId} key={`baseline-${run.runId}`}>{run.variantId} · {run.runId}</option>)}
          </select>
        </label>
        <label>候选
          <select value={candidateRunId} onChange={(event) => onCandidateRunChange(event.target.value)}>
            {runs.map((run) => <option value={run.runId} key={`candidate-${run.runId}`}>{run.variantId} · {run.runId}</option>)}
          </select>
        </label>
        <label>对比方式
          <select value={comparisonType} onChange={(event) => onComparisonTypeChange(event.target.value as RetrievalComparisonType)}>
            <option value="EMBEDDING">向量 A vs B</option>
            <option value="RERANKER">重排器 A vs B</option>
            <option value="CONFIG">配置 A vs B</option>
          </select>
        </label>
        <button type="button" disabled={comparing || baselineRunId === '' || candidateRunId === ''} onClick={onCompare}>
          {comparing ? '对比中…' : '对比运行'}
        </button>
      </div>

      {comparison === undefined ? null : <ComparisonPanel comparison={comparison} />}
    </section>
  )
}

function RetrievalMetricsTable({ runs }: { runs: readonly RetrievalRunSummary[] }) {
  return (
    <div className="eval-scroll">
      <table className="eval-table eval-metrics-wide">
        <thead><tr>
          <th>变体</th><th>Recall@1</th><th>@5</th><th>@10</th><th>@20</th><th>@50</th><th>Hit@1</th>
          <th>MRR</th><th>MAP</th><th>nDCG@10</th><th>零结果</th><th>跨项目</th><th>跨对齐</th><th>关键规格</th><th>实体误判HC</th>
        </tr></thead>
        <tbody>
          {runs.map((run) => {
            const metrics = run.metrics
            return <tr key={run.runId}>
              <td><strong>{run.variantId}</strong><br /><code>{run.runId}</code></td>
              <td>{metricPercent(recallAt(metrics, 1))}</td>
              <td>{metricPercent(recallAt(metrics, 5))}</td>
              <td>{metricPercent(recallAt(metrics, 10))}</td>
              <td>{metricPercent(recallAt(metrics, 20))}</td>
              <td>{metricPercent(recallAt(metrics, 50))}</td>
              <td>{metricPercent(metrics?.hitAt1)}</td>
              <td>{metricNumber(metrics?.mrr)}</td>
              <td>{metricNumber(metrics?.map)}</td>
              <td>{metricNumber(metrics?.ndcgAt10)}</td>
              <td>{metricPercent(metrics?.zeroResultRate)}</td>
              <td>{metricPercent(metrics?.crossProjectLeakageRate)}</td>
              <td>{metricPercent(metrics?.crossAlignmentConflictRate)}</td>
              <td>{metricPercent(metrics?.criticalSpecConflictRate)}</td>
              <td>{metricPercent(metrics?.wrongEntityHighConfidenceRate)}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonPanel({ comparison }: { comparison: RetrievalRunComparison }) {
  const moved = comparison.rankMovements.filter((item) => (item.rankDelta ?? 0) !== 0 || Math.abs(item.scoreDelta ?? 0) > 1e-9)
  return (
    <div className="eval-comparison-result">
      <div className="eval-comparison-summary">
        <strong>{comparison.comparisonType} 对比</strong>
        <span>胜 / 负 / 平: {comparison.pairedStats.wins} / {comparison.pairedStats.losses} / {comparison.pairedStats.ties}</span>
        <span>样本: {comparison.pairedStats.sampleSize}</span>
        <span className={comparison.pairedStats.conclusion === 'INCONCLUSIVE' ? 'eval-status-warning' : 'eval-status-ok'}>
          {comparison.pairedStats.conclusion}
        </span>
        {comparison.pairedStats.bootstrap95Ci === undefined ? null : (
          <span>Bootstrap 95% 置信区间: [{comparison.pairedStats.bootstrap95Ci[0].toFixed(4)}, {comparison.pairedStats.bootstrap95Ci[1].toFixed(4)}]</span>
        )}
      </div>
      {comparison.pairedStats.minimumSampleWarning ? (
        <p className="eval-status-warning">最小样本警告:统计结论仍为 INCONCLUSIVE。</p>
      ) : null}
      {comparison.deterministicSafetyRegression ? (
        <p className="eval-error">确定性安全回归: {comparison.safetyRegressionReasons.join('; ')}</p>
      ) : (
        <p className="eval-status-ok">无确定性安全回归。</p>
      )}
      <p>改善用例: {comparison.improvedCaseIds.join(', ') || '—'} · 退化用例: {comparison.regressedCaseIds.join(', ') || '—'}</p>

      <h3>指标增量</h3>
      <table className="eval-table">
        <thead><tr><th>指标</th><th>基线</th><th>候选</th><th>增量</th></tr></thead>
        <tbody>{comparison.metricDeltas.map((delta) => (
          <tr key={delta.metric}><td>{delta.metric}</td><td>{delta.baseline.toFixed(4)}</td><td>{delta.candidate.toFixed(4)}</td><td>{signed(delta.delta)}</td></tr>
        ))}</tbody>
      </table>

      <h3>排名 / 分数变动</h3>
      <div className="eval-scroll">
        <table className="eval-table">
          <thead><tr><th>用例</th><th>实体</th><th>排名 A</th><th>排名 B</th><th>排名 Δ</th><th>分数 A</th><th>分数 B</th><th>分数 Δ</th></tr></thead>
          <tbody>{moved.map((movement) => (
            <tr key={`${movement.caseId}:${movement.entityId}`}>
              <td>{movement.caseId}</td><td><code>{movement.entityId}</code></td>
              <td>{movement.baselineRank ?? '—'}</td><td>{movement.candidateRank ?? '—'}</td><td>{movement.rankDelta ?? '—'}</td>
              <td>{movement.baselineScore?.toFixed(4) ?? '—'}</td><td>{movement.candidateScore?.toFixed(4) ?? '—'}</td><td>{movement.scoreDelta === undefined ? '—' : signed(movement.scoreDelta)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function LeakagePanel({ report }: { report: RetrievalLeakageReport }) {
  return (
    <section className="eval-panel">
      <div className="eval-panel-heading">
        <h2>数据集泄露检查</h2>
        <span className={report.releaseHoldoutContaminated ? 'eval-status-danger' : 'eval-status-ok'}>
          {report.releaseHoldoutContaminated ? 'RELEASE_HOLDOUT 已污染' : '无留出集污染'}
        </span>
      </div>
      <table className="eval-table">
        <thead><tr><th>类型</th><th>用例</th><th>划分</th><th>严重度</th><th>原因</th></tr></thead>
        <tbody>
          {report.findings.map((finding) => (
            <tr key={finding.findingId}>
              <td>{finding.kind}</td>
              <td>{finding.caseIds.join(', ')}</td>
              <td>{finding.splits.join(' / ')}</td>
              <td>{finding.severity}</td>
              <td>{finding.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function preferredRunId(runs: readonly RetrievalRunSummary[], variantId: string): string {
  return runs.find((run) => run.variantId === variantId)?.runId ?? runs[0]?.runId ?? ''
}

function recallAt(metrics: RetrievalRunSummary['metrics'], k: 1 | 5 | 10 | 20 | 50): number | undefined {
  return metrics?.recallAtK.find((item) => item.k === k)?.value
}

function metricPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

function metricNumber(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(4)
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
