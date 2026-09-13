import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import {
  mutationEvalRunIdFromPath, mutationEvalRunPath, mutationOperationIdFromPath, mutationOperationPath,
  ragEvalRunIdFromPath, ragEvalRunPath, resolveAppRoute, retrievalDebugPath, retrievalDebugTraceIdFromPath,
  retrievalRunIdFromPath, retrievalRunPath, routePath, traceEvalRunIdFromPath, traceEvalRunPath, traceIdFromPath, tracePath,
} from '../src/app/routes'

describe('AppShell routing', () => {
  it('keeps root and chat paths on the existing coding chat', () => { expect(resolveAppRoute('/')).toBe('chat'); expect(resolveAppRoute('/chat')).toBe('chat'); expect(routePath('chat')).toBe('/chat') })
  it('routes /industry to the workspace slot', () => { expect(resolveAppRoute('/industry')).toBe('industry'); const html = renderToStaticMarkup(<AppShell initialPath="/industry" industryWorkspace={<div>Industry Workspace sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />); expect(html).toContain('Industry Workspace sentinel'); expect(html).not.toContain('Coding chat sentinel') })
  it('routes P8 management pages before the generic industry catch-all', () => {
    expect(resolveAppRoute('/industry/multimodal')).toBe('industry-multimodal'); expect(routePath('industry-multimodal')).toBe('/industry/multimodal'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/multimodal" multimodal={<div>Multimodal sentinel</div>} />)).toContain('Multimodal sentinel')
    expect(resolveAppRoute('/industry/agent-loop')).toBe('industry-agent-loop'); expect(routePath('industry-agent-loop')).toBe('/industry/agent-loop'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/agent-loop" agentLoop={<div>Agent Loop sentinel</div>} />)).toContain('Agent Loop sentinel')
  })
  it('routes Knowledge before the generic industry catch-all', () => { expect(resolveAppRoute('/industry/knowledge')).toBe('industry-knowledge'); expect(routePath('industry-knowledge')).toBe('/industry/knowledge'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/knowledge" knowledge={<div>Knowledge sentinel</div>} />)).toContain('Knowledge sentinel') })
  it('routes Trace Explorer list and detail before the generic industry catch-all', () => { expect(resolveAppRoute('/industry/traces')).toBe('industry-traces'); const detailPath = tracePath('trace project/1'); expect(resolveAppRoute(detailPath)).toBe('industry-trace-detail'); expect(traceIdFromPath(detailPath)).toBe('trace project/1'); expect(renderToStaticMarkup(<AppShell initialPath={detailPath} traceExplorer={<div>Trace detail sentinel</div>} />)).toContain('Trace detail sentinel') })
  it('routes single-trace Retrieval Debug separately from Retrieval Eval', () => { const path = retrievalDebugPath('trace project/1'); expect(resolveAppRoute(path)).toBe('industry-retrieval-debug'); expect(retrievalDebugTraceIdFromPath(path)).toBe('trace project/1') })
  it('routes Mutation Center paths', () => { expect(resolveAppRoute('/industry/mutations')).toBe('industry-mutations'); expect(resolveAppRoute('/industry/mutations/reconciliation')).toBe('industry-mutation-reconciliation'); const detailPath = mutationOperationPath('mutation project/1'); expect(resolveAppRoute(detailPath)).toBe('industry-mutation-detail'); expect(mutationOperationIdFromPath(detailPath)).toBe('mutation project/1') })
  it('routes /industry/eval to the evaluation overview slot', () => { expect(resolveAppRoute('/industry/eval')).toBe('industry-eval'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval" evalOverview={<div>Eval overview sentinel</div>} />)).toContain('Eval overview sentinel') })

  it('routes P8 eval labs before the generic eval catch-all', () => {
    expect(resolveAppRoute('/industry/eval/multimodal')).toBe('industry-eval-multimodal'); expect(routePath('industry-eval-multimodal')).toBe('/industry/eval/multimodal'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/multimodal" p8Eval={<div>P8 Eval sentinel</div>} />)).toContain('P8 Eval sentinel')
    expect(resolveAppRoute('/industry/eval/agent-loop')).toBe('industry-eval-agent-loop'); expect(routePath('industry-eval-agent-loop')).toBe('/industry/eval/agent-loop'); expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/agent-loop" p8Eval={<div>P8 Eval sentinel</div>} />)).toContain('P8 Eval sentinel')
  })

  it('routes all four P7 specialist labs before the generic eval catch-all', () => {
    const rows = [
      ['/industry/eval/normalization', 'industry-eval-normalization'],
      ['/industry/eval/entity', 'industry-eval-entity'],
      ['/industry/eval/tool', 'industry-eval-tool'],
      ['/industry/eval/memory', 'industry-eval-memory'],
    ] as const
    for (const [path, route] of rows) {
      expect(resolveAppRoute(path)).toBe(route)
      expect(routePath(route)).toBe(path)
      expect(renderToStaticMarkup(<AppShell initialPath={path} p7Eval={<div>P7 Eval sentinel</div>} />)).toContain('P7 Eval sentinel')
    }
  })

  it('routes RAG Eval workbench and result pages before generic eval', () => { expect(resolveAppRoute('/industry/eval/rag')).toBe('industry-eval-rag'); const path = ragEvalRunPath('run rag/guarded'); expect(resolveAppRoute(path)).toBe('industry-eval-rag-run'); expect(ragEvalRunIdFromPath(path)).toBe('run rag/guarded') })
  it('routes Trace Eval workbench and result pages before generic eval', () => { expect(resolveAppRoute('/industry/eval/trace')).toBe('industry-eval-trace'); const path = traceEvalRunPath('run trace/guarded'); expect(resolveAppRoute(path)).toBe('industry-eval-trace-run'); expect(traceEvalRunIdFromPath(path)).toBe('run trace/guarded') })
  it('routes mutation evaluation workbench and result pages', () => { expect(resolveAppRoute('/industry/eval/mutation')).toBe('industry-eval-mutation'); const path = mutationEvalRunPath('run mutation/guarded'); expect(resolveAppRoute(path)).toBe('industry-eval-mutation-run'); expect(mutationEvalRunIdFromPath(path)).toBe('run mutation/guarded') })
  it('routes retrieval playground and run detail', () => { expect(resolveAppRoute('/industry/eval/playground/retrieval')).toBe('industry-eval-retrieval'); const path = retrievalRunPath('run candidate/2'); expect(resolveAppRoute(path)).toBe('industry-eval-retrieval-run'); expect(retrievalRunIdFromPath(path)).toBe('run candidate/2') })
  it('renders the coding chat slot for /chat', () => { expect(renderToStaticMarkup(<AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />)).toContain('Coding chat sentinel') })
})
