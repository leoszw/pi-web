import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import CodingChatApp from '../App'
import { EvalOverviewPage } from '../features/eval/EvalOverviewPage'
import { IntentLabPage } from '../features/eval/IntentLabPage'
import { MutationEvalPage } from '../features/eval/MutationEvalPage'
import { P7EvalPage } from '../features/eval/P7EvalPage'
import { P8EvalPage } from '../features/eval/P8EvalPage'
import { P9EvalPage } from '../features/eval/P9EvalPage'
import { RagEvalPage } from '../features/eval/RagEvalPage'
import { RetrievalLabPage } from '../features/eval/RetrievalLabPage'
import { RetrievalRunPage } from '../features/eval/RetrievalRunPage'
import { TraceEvalPage } from '../features/eval/TraceEvalPage'
import { UnifiedBenchmarkPage } from '../features/eval/UnifiedBenchmarkPage'
import { IndustryWorkspacePage } from '../features/industry-workspace/IndustryWorkspacePage'
import { KnowledgePage } from '../features/knowledge/KnowledgePage'
import { MutationCenterPage } from '../features/mutation-center/MutationCenterPage'
import { AgentLoopPage } from '../features/p8/AgentLoopPage'
import { MultimodalPage } from '../features/p8/MultimodalPage'
import { ReportCenterPage } from '../features/p9/ReportCenterPage'
import { SandboxPage } from '../features/p9/SandboxPage'
import { OperationsPage } from '../features/p10/OperationsPage'
import { RuntimePage } from '../features/p10/RuntimePage'
import { OnlineQualityPage } from '../features/p12/OnlineQualityPage'
import { RetrievalDebugPage } from '../features/trace/RetrievalDebugPage'
import { TracePage } from '../features/trace/TracePage'
import {
  isEvaluationRoute,isMutationRoute,isTraceRoute,mutationEvalRunIdFromPath,mutationOperationIdFromPath,
  ragEvalRunIdFromPath,resolveAppRoute,retrievalDebugTraceIdFromPath,retrievalRunIdFromPath,routePath,
  traceEvalRunIdFromPath,traceIdFromPath,type AppRoute,
} from './routes'
import './app-shell.css'

export interface AppShellProps {
  initialPath?: string
  codingChat?: ReactNode
  industryWorkspace?: ReactNode
  knowledge?: ReactNode
  multimodal?: ReactNode
  agentLoop?: ReactNode
  reportCenter?: ReactNode
  sandbox?: ReactNode
  runtime?: ReactNode
  operations?: ReactNode
  onlineQuality?: ReactNode
  traceExplorer?: ReactNode
  retrievalDebug?: ReactNode
  mutationCenter?: ReactNode
  evalOverview?: ReactNode
  unifiedBenchmark?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
  mutationEval?: ReactNode
  traceEval?: ReactNode
  ragEval?: ReactNode
  p7Eval?: ReactNode
  p8Eval?: ReactNode
  p9Eval?: ReactNode
}

export function AppShell(props:AppShellProps){
  const{initialPath}=props;const[route,setRoute]=useState<AppRoute>(()=>resolveAppRoute(initialPath??currentPath()));const pathname=initialPath??currentPath();const retrievalRunId=retrievalRunIdFromPath(pathname);const retrievalDebugTraceId=retrievalDebugTraceIdFromPath(pathname);const mutationEvalRunId=mutationEvalRunIdFromPath(pathname);const traceEvalRunId=traceEvalRunIdFromPath(pathname);const ragEvalRunId=ragEvalRunIdFromPath(pathname);const mutationOperationId=mutationOperationIdFromPath(pathname);const traceId=traceIdFromPath(pathname)
  useEffect(()=>{if(initialPath!==undefined)return undefined;const onPopState=():void=>setRoute(resolveAppRoute(window.location.pathname));window.addEventListener('popstate',onPopState);return()=>window.removeEventListener('popstate',onPopState)},[initialPath])
  const navigate=(target:AppRoute)=>(event:MouseEvent<HTMLAnchorElement>):void=>{if(initialPath!==undefined)return;event.preventDefault();const path=routePath(target);if(window.location.pathname!==path)window.history.pushState({},'',path);setRoute(target)}
  return <div className="app-shell"><nav className="app-shell__nav" aria-label="主导航">
    <a href="/chat" data-active={route==='chat'} onClick={navigate('chat')}>Coding Chat</a><a href="/industry" data-active={route==='industry'} onClick={navigate('industry')}>Industry Agent</a><a href="/industry/knowledge" data-active={route==='industry-knowledge'} onClick={navigate('industry-knowledge')}>Knowledge</a><a href="/industry/multimodal" data-active={route==='industry-multimodal'} onClick={navigate('industry-multimodal')}>Multimodal</a><a href="/industry/agent-loop" data-active={route==='industry-agent-loop'} onClick={navigate('industry-agent-loop')}>Agent Loop</a><a href="/industry/reports" data-active={route==='industry-reports'} onClick={navigate('industry-reports')}>Reports</a><a href="/industry/sandbox" data-active={route==='industry-sandbox'} onClick={navigate('industry-sandbox')}>Sandbox</a><a href="/industry/runtime" data-active={route==='industry-runtime'} onClick={navigate('industry-runtime')}>Runtime</a><a href="/industry/operations" data-active={route==='industry-operations'} onClick={navigate('industry-operations')}>Operations</a><a href="/industry/quality" data-active={route==='industry-quality'} onClick={navigate('industry-quality')}>Quality</a><a href="/industry/traces" data-active={isTraceRoute(route)} onClick={navigate('industry-traces')}>Trace</a><a href="/industry/mutations" data-active={isMutationRoute(route)} onClick={navigate('industry-mutations')}>Mutation Center</a><a href="/industry/eval" data-active={isEvaluationRoute(route)} onClick={navigate('industry-eval')}>Evaluation</a>
  </nav><div className="app-shell__content"><AppContent {...props} route={route} traceId={traceId} retrievalDebugTraceId={retrievalDebugTraceId} retrievalRunId={retrievalRunId} mutationEvalRunId={mutationEvalRunId} traceEvalRunId={traceEvalRunId} ragEvalRunId={ragEvalRunId} mutationOperationId={mutationOperationId}/></div></div>
}

function AppContent(props:AppShellProps&{route:AppRoute;traceId:string|null;retrievalDebugTraceId:string|null;retrievalRunId:string|null;mutationEvalRunId:string|null;traceEvalRunId:string|null;ragEvalRunId:string|null;mutationOperationId:string|null}){
  const{route,traceId,retrievalDebugTraceId,retrievalRunId,mutationEvalRunId,traceEvalRunId,ragEvalRunId,mutationOperationId}=props
  if(route==='industry-eval-benchmark')return props.unifiedBenchmark??<UnifiedBenchmarkPage/>
  if(route==='industry-eval-report')return props.p9Eval??<P9EvalPage domain="REPORT"/>
  if(route==='industry-eval-sandbox')return props.p9Eval??<P9EvalPage domain="SANDBOX"/>
  if(route==='industry-eval-multimodal')return props.p8Eval??<P8EvalPage domain="MULTIMODAL"/>
  if(route==='industry-eval-agent-loop')return props.p8Eval??<P8EvalPage domain="AGENT_LOOP"/>
  if(route==='industry-eval-normalization')return props.p7Eval??<P7EvalPage domain="NORMALIZATION"/>
  if(route==='industry-eval-entity')return props.p7Eval??<P7EvalPage domain="ENTITY"/>
  if(route==='industry-eval-tool')return props.p7Eval??<P7EvalPage domain="TOOL"/>
  if(route==='industry-eval-memory')return props.p7Eval??<P7EvalPage domain="MEMORY"/>
  if(route==='industry-eval-rag-run'&&ragEvalRunId!==null)return props.ragEval??<RagEvalPage runId={ragEvalRunId}/>
  if(route==='industry-eval-rag')return props.ragEval??<RagEvalPage/>
  if(route==='industry-eval-trace-run'&&traceEvalRunId!==null)return props.traceEval??<TraceEvalPage runId={traceEvalRunId}/>
  if(route==='industry-eval-trace')return props.traceEval??<TraceEvalPage/>
  if(route==='industry-eval-mutation-run'&&mutationEvalRunId!==null)return props.mutationEval??<MutationEvalPage runId={mutationEvalRunId}/>
  if(route==='industry-eval-mutation')return props.mutationEval??<MutationEvalPage/>
  if(route==='industry-eval-retrieval-run'&&retrievalRunId!==null)return props.retrievalRun??<RetrievalRunPage runId={retrievalRunId}/>
  if(route==='industry-eval-retrieval')return props.retrievalLab??<RetrievalLabPage/>
  if(route==='industry-eval-intent')return props.intentLab??<IntentLabPage/>
  if(route==='industry-eval')return props.evalOverview??<EvalOverviewPage/>
  if(route==='industry-quality')return props.onlineQuality??<OnlineQualityPage/>
  if(route==='industry-runtime')return props.runtime??<RuntimePage/>
  if(route==='industry-operations')return props.operations??<OperationsPage/>
  if(route==='industry-reports')return props.reportCenter??<ReportCenterPage/>
  if(route==='industry-sandbox')return props.sandbox??<SandboxPage/>
  if(route==='industry-multimodal')return props.multimodal??<MultimodalPage/>
  if(route==='industry-agent-loop')return props.agentLoop??<AgentLoopPage/>
  if(route==='industry-knowledge')return props.knowledge??<KnowledgePage/>
  if(route==='industry-retrieval-debug'&&retrievalDebugTraceId!==null)return props.retrievalDebug??<RetrievalDebugPage traceId={retrievalDebugTraceId}/>
  if(route==='industry-trace-detail'&&traceId!==null)return props.traceExplorer??<TracePage traceId={traceId}/>
  if(route==='industry-traces')return props.traceExplorer??<TracePage/>
  if(route==='industry-mutation-detail'&&mutationOperationId!==null)return props.mutationCenter??<MutationCenterPage mode="detail" operationId={mutationOperationId}/>
  if(route==='industry-mutation-reconciliation')return props.mutationCenter??<MutationCenterPage mode="reconciliation"/>
  if(route==='industry-mutations')return props.mutationCenter??<MutationCenterPage mode="list"/>
  if(route==='industry')return props.industryWorkspace??<IndustryWorkspacePage/>
  return props.codingChat??<CodingChatApp/>
}
function currentPath():string{return typeof window==='undefined'?'/chat':window.location.pathname}
