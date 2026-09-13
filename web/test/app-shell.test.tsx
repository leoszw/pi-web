import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import {
  mutationEvalRunIdFromPath,
  mutationEvalRunPath,
  mutationOperationIdFromPath,
  mutationOperationPath,
  ragEvalRunIdFromPath,
  ragEvalRunPath,
  resolveAppRoute,
  retrievalDebugPath,
  retrievalDebugTraceIdFromPath,
  retrievalRunIdFromPath,
  retrievalRunPath,
  routePath,
  traceEvalRunIdFromPath,
  traceEvalRunPath,
  traceIdFromPath,
  tracePath,
} from '../src/app/routes'

describe('AppShell routing', () => {
  it('keeps root and chat paths on the existing coding chat', () => {
    expect(resolveAppRoute('/')).toBe('chat')
    expect(resolveAppRoute('/chat')).toBe('chat')
    expect(routePath('chat')).toBe('/chat')
  })

  it('routes /industry to the workspace slot', () => {
    expect(resolveAppRoute('/industry')).toBe('industry')
    const html = renderToStaticMarkup(<AppShell initialPath="/industry" industryWorkspace={<div>Industry Workspace sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />)
    expect(html).toContain('Industry Workspace sentinel')
    expect(html).not.toContain('Coding chat sentinel')
  })

  it('routes Knowledge before the generic industry catch-all', () => {
    expect(resolveAppRoute('/industry/knowledge')).toBe('industry-knowledge')
    expect(routePath('industry-knowledge')).toBe('/industry/knowledge')
    const html = renderToStaticMarkup(<AppShell initialPath="/industry/knowledge" knowledge={<div>Knowledge sentinel</div>} />)
    expect(html).toContain('Knowledge sentinel')
  })

  it('routes Trace Explorer list and detail before the generic industry catch-all', () => {
    expect(resolveAppRoute('/industry/traces')).toBe('industry-traces')
    const detailPath = tracePath('trace project/1')
    expect(resolveAppRoute(detailPath)).toBe('industry-trace-detail')
    expect(traceIdFromPath(detailPath)).toBe('trace project/1')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/traces" traceExplorer={<div>Trace list sentinel</div>} />)).toContain('Trace list sentinel')
    expect(renderToStaticMarkup(<AppShell initialPath={detailPath} traceExplorer={<div>Trace detail sentinel</div>} />)).toContain('Trace detail sentinel')
  })

  it('routes single-trace Retrieval Debug separately from Retrieval Eval', () => {
    const path = retrievalDebugPath('trace project/1')
    expect(resolveAppRoute(path)).toBe('industry-retrieval-debug')
    expect(retrievalDebugTraceIdFromPath(path)).toBe('trace project/1')
    expect(renderToStaticMarkup(<AppShell initialPath={path} retrievalDebug={<div>Retrieval Debug sentinel</div>} />)).toContain('Retrieval Debug sentinel')
  })

  it('routes Mutation Center list detail and reconciliation paths', () => {
    expect(resolveAppRoute('/industry/mutations')).toBe('industry-mutations')
    expect(resolveAppRoute('/industry/mutations/reconciliation')).toBe('industry-mutation-reconciliation')
    const detailPath = mutationOperationPath('mutation project/1')
    expect(resolveAppRoute(detailPath)).toBe('industry-mutation-detail')
    expect(mutationOperationIdFromPath(detailPath)).toBe('mutation project/1')
  })

  it('routes /industry/eval to the evaluation overview slot', () => {
    expect(resolveAppRoute('/industry/eval')).toBe('industry-eval')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval" evalOverview={<div>Eval overview sentinel</div>} />)).toContain('Eval overview sentinel')
  })

  it('routes RAG Eval workbench and result pages before generic eval', () => {
    expect(resolveAppRoute('/industry/eval/rag')).toBe('industry-eval-rag')
    expect(routePath('industry-eval-rag')).toBe('/industry/eval/rag')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/rag" ragEval={<div>RAG Eval sentinel</div>} />)).toContain('RAG Eval sentinel')
    const path = ragEvalRunPath('run rag/guarded')
    expect(path).toBe('/industry/eval/runs/run%20rag%2Fguarded/rag')
    expect(resolveAppRoute(path)).toBe('industry-eval-rag-run')
    expect(ragEvalRunIdFromPath(path)).toBe('run rag/guarded')
    expect(renderToStaticMarkup(<AppShell initialPath={path} ragEval={<div>RAG Eval run sentinel</div>} />)).toContain('RAG Eval run sentinel')
  })

  it('routes Trace Eval workbench and result pages before generic eval', () => {
    expect(resolveAppRoute('/industry/eval/trace')).toBe('industry-eval-trace')
    const path = traceEvalRunPath('run trace/guarded')
    expect(resolveAppRoute(path)).toBe('industry-eval-trace-run')
    expect(traceEvalRunIdFromPath(path)).toBe('run trace/guarded')
  })

  it('routes mutation evaluation workbench and result pages', () => {
    expect(resolveAppRoute('/industry/eval/mutation')).toBe('industry-eval-mutation')
    const path = mutationEvalRunPath('run mutation/guarded')
    expect(resolveAppRoute(path)).toBe('industry-eval-mutation-run')
    expect(mutationEvalRunIdFromPath(path)).toBe('run mutation/guarded')
  })

  it('routes retrieval playground and run detail', () => {
    expect(resolveAppRoute('/industry/eval/playground/retrieval')).toBe('industry-eval-retrieval')
    const path = retrievalRunPath('run candidate/2')
    expect(resolveAppRoute(path)).toBe('industry-eval-retrieval-run')
    expect(retrievalRunIdFromPath(path)).toBe('run candidate/2')
  })

  it('renders the coding chat slot for /chat', () => {
    expect(renderToStaticMarkup(<AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />)).toContain('Coding chat sentinel')
  })
})
