import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import {
  mutationEvalRunIdFromPath,
  mutationEvalRunPath,
  mutationOperationIdFromPath,
  mutationOperationPath,
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

  it('routes /industry to the P3 workspace slot', () => {
    expect(resolveAppRoute('/industry')).toBe('industry')
    const html = renderToStaticMarkup(<AppShell initialPath="/industry" industryWorkspace={<div>Industry Workspace sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />)
    expect(html).toContain('Industry Workspace sentinel')
    expect(html).not.toContain('Coding chat sentinel')
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

  it('routes Mutation Center list, detail, and reconciliation paths', () => {
    expect(resolveAppRoute('/industry/mutations')).toBe('industry-mutations')
    expect(resolveAppRoute('/industry/mutations/reconciliation')).toBe('industry-mutation-reconciliation')
    const detailPath = mutationOperationPath('mutation project/1')
    expect(resolveAppRoute(detailPath)).toBe('industry-mutation-detail')
    expect(mutationOperationIdFromPath(detailPath)).toBe('mutation project/1')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/mutations" mutationCenter={<div>Mutation Center sentinel</div>} />)).toContain('Mutation Center sentinel')
  })

  it('routes /industry/eval to the evaluation overview slot', () => {
    expect(resolveAppRoute('/industry/eval')).toBe('industry-eval')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval" evalOverview={<div>Eval overview sentinel</div>} />)).toContain('Eval overview sentinel')
  })

  it('routes /industry/eval/intent to the Intent Lab slot', () => {
    expect(resolveAppRoute('/industry/eval/intent')).toBe('industry-eval-intent')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/intent" intentLab={<div>Intent Lab sentinel</div>} />)).toContain('Intent Lab sentinel')
  })

  it('routes Trace Eval workbench and result pages before generic eval', () => {
    expect(resolveAppRoute('/industry/eval/trace')).toBe('industry-eval-trace')
    expect(routePath('industry-eval-trace')).toBe('/industry/eval/trace')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/trace" traceEval={<div>Trace Eval sentinel</div>} />)).toContain('Trace Eval sentinel')
    const path = traceEvalRunPath('run trace/guarded')
    expect(path).toBe('/industry/eval/runs/run%20trace%2Fguarded/trace')
    expect(resolveAppRoute(path)).toBe('industry-eval-trace-run')
    expect(traceEvalRunIdFromPath(path)).toBe('run trace/guarded')
    expect(renderToStaticMarkup(<AppShell initialPath={path} traceEval={<div>Trace Eval run sentinel</div>} />)).toContain('Trace Eval run sentinel')
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
