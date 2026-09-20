import { useEffect, useMemo, useState } from 'react'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type { EvalDatasetSummary } from '../../../../shared/industry/eval/datasets'
import type { EvalRunSummary } from '../../../../shared/industry/eval/runs'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()
export interface EvalOverviewSnapshot { datasets: readonly EvalDatasetSummary[]; runs: readonly EvalRunSummary[]; variants: readonly EvalVariantSummary[] }

export function EvalOverviewPage({ client = defaultEvaluationClient, initialSnapshot }: { client?: EvaluationApiClient; initialSnapshot?: EvalOverviewSnapshot }) {
  const [snapshot, setSnapshot] = useState<EvalOverviewSnapshot | undefined>(initialSnapshot)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (initialSnapshot !== undefined) return undefined; let cancelled=false; void Promise.all([client.listDatasets(),client.listRuns(),client.listVariants()]).then(([datasets,runs,variants])=>{if(!cancelled)setSnapshot({datasets,runs,variants})}).catch((reason:unknown)=>{if(!cancelled)setError(reason instanceof Error?reason.message:String(reason))}); return()=>{cancelled=true} }, [client,initialSnapshot])
  if(error!==null)return <main className="eval-page"><h1>评测</h1><p role="alert">{error}</p></main>
  if(snapshot===undefined)return <main className="eval-page"><h1>评测</h1><p>正在加载评测工作区…</p></main>
  return <EvalOverviewView snapshot={snapshot}/>
}

export function EvalOverviewView({snapshot}:{snapshot:EvalOverviewSnapshot}){
  const completedRuns=useMemo(()=>snapshot.runs.filter((run)=>run.status==='COMPLETED'),[snapshot.runs])
  return <main className="eval-page" aria-labelledby="eval-overview-title"><div className="eval-eyebrow">评测工作台 · P12</div><div className="eval-heading-row"><div><h1 id="eval-overview-title">评测</h1><p>P11 统一基准评测/发布门禁仍为受治理的离线门禁;P12 增加了在线质量反馈回路,将脱敏追踪转换为由人工评审的数据集版本,不进行自动 Golden 晋升。</p></div><div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/eval/benchmark">统一基准评测</a><a className="eval-primary-link" href="/industry/quality">在线质量</a><a className="eval-primary-link" href="/industry/eval/intent">意图实验</a><a className="eval-primary-link" href="/industry/eval/playground/retrieval">检索实验</a><a className="eval-primary-link" href="/industry/eval/mutation">变更</a><a className="eval-primary-link" href="/industry/eval/trace">追踪</a><a className="eval-primary-link" href="/industry/eval/rag">RAG</a><a className="eval-primary-link" href="/industry/eval/normalization">归一化</a><a className="eval-primary-link" href="/industry/eval/entity">实体</a><a className="eval-primary-link" href="/industry/eval/tool">工具</a><a className="eval-primary-link" href="/industry/eval/memory">内存</a><a className="eval-primary-link" href="/industry/eval/multimodal">多模态</a><a className="eval-primary-link" href="/industry/eval/agent-loop">智能体循环</a><a className="eval-primary-link" href="/industry/eval/report">报告</a><a className="eval-primary-link" href="/industry/eval/sandbox">沙箱</a></div></div>
    <section className="eval-summary-grid" aria-label="评测摘要"><article><strong>1030</strong><span>P11 Golden / 硬语料库</span></article><article><strong>13</strong><span>统一基准评测领域</span></article><article><strong>11</strong><span>P12 在线质量指标</span></article><article><strong>{snapshot.datasets.length}</strong><span>意图数据集</span></article><article><strong>{completedRuns.length}</strong><span>已完成的意图运行</span></article><article><strong>10</strong><span>检索阶段</span></article><article><strong>7</strong><span>变更安全门禁</span></article><article><strong>6</strong><span>追踪门禁</span></article><article><strong>4</strong><span>RAG 证据用例</span></article><article><strong>4</strong><span>P7 专家实验室</span></article><article><strong>6</strong><span>多模态安全用例</span></article><article><strong>9</strong><span>智能体循环安全用例</span></article><article><strong>10</strong><span>报告安全用例</span></article><article><strong>8</strong><span>沙箱安全用例</span></article></section>
    <section className="eval-panel"><h2>数据集</h2><table className="eval-table"><thead><tr><th>名称</th><th>状态</th><th>用例</th><th>版本</th><th>指纹</th></tr></thead><tbody>{snapshot.datasets.map((dataset)=><tr key={dataset.datasetId}><td>{dataset.name}</td><td>{dataset.status}</td><td>{dataset.caseCount}</td><td>{dataset.version}</td><td><code>{dataset.fingerprint.slice(0,12)}</code></td></tr>)}</tbody></table></section>
    <section className="eval-panel"><h2>近期意图运行</h2><table className="eval-table"><thead><tr><th>运行</th><th>数据集</th><th>变体</th><th>状态</th><th>准确率</th></tr></thead><tbody>{snapshot.runs.map((run)=><tr key={run.runId}><td><code>{run.runId}</code></td><td>{run.datasetId}</td><td>{run.variantId}</td><td>{run.status}</td><td>{run.metrics===undefined?'—':`${(run.metrics.accuracy.value*100).toFixed(1)}%`}</td></tr>)}</tbody></table></section>
  </main>
}
