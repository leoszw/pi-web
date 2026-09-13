import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import {
  mutationEvalRunIdFromPath,
  mutationEvalRunPath,
  mutationOperationIdFromPath,
  mutationOperationPath,
  resolveAppRoute,
  retrievalRunIdFromPath,
  retrievalRunPath,
  routePath,
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
    expect(routePath('industry-traces')).toBe('/industry/traces')
    const detailPath = tracePath('trace project/1')
    expect(detailPath).toBe('/industry/traces/trace%20project%2F1')
    expect(resolveAppRoute(detailPath)).toBe('industry-trace-detail')
    expect(traceIdFromPath(detailPath)).toBe('trace project/1')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/traces" traceExplorer={<div>Trace list sentinel</div>} />)).toContain('Trace list sentinel')
    expect(renderToStaticMarkup(<AppShell initialPath={detailPath} traceExplorer={<div>Trace detail sentinel</div>} />)).toContain('Trace detail sentinel')
  })

  it('routes Mutation Center list, detail, and reconciliation paths', () => {
    expect(resolveAppRoute('/industry/mutations')).toBe('industry-mutations')
    expect(routePath('industry-mutations')).toBe('/industry/mutations')
    expect(resolveAppRoute('/industry/mutations/reconciliation')).toBe('industry-mutation-reconciliation')
    expect(routePath('industry-mutation-reconciliation')).toBe('/industry/mutations/reconciliation')

    const detailPath = mutationOperationPath('mutation project/1')
    expect(detailPath).toBe('/industry/mutations/mutation%20project%2F1')
    expect(resolveAppRoute(detailPath)).toBe('industry-mutation-detail')
    expect(mutationOperationIdFromPath(detailPath)).toBe('mutation project/1')

    expect(renderToStaticMarkup(<AppShell initialPath="/industry/mutations" mutationCenter={<div>Mutation Center sentinel</div>} />)).toContain('Mutation Center sentinel')
    expect(renderToStaticMarkup(<AppShell initialPath={detailPath} mutationCenter={<div>Mutation detail sentinel</div>} />)).toContain('Mutation detail sentinel')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/mutations/reconciliation" mutationCenter={<div>Reconciliation sentinel</div>} />)).toContain('Reconciliation sentinel')
  })

  it('routes /industry/eval to the evaluation overview slot', () => {
    expect(resolveAppRoute('/industry/eval')).toBe('industry-eval')
    expect(routePath('industry-eval')).toBe('/industry/eval')
    const html = renderToStaticMarkup(<AppShell initialPath="/industry/eval" evalOverview={<div>Eval overview sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />)
    expect(html).toContain('Eval overview sentinel')
    expect(html).not.toContain('Coding chat sentinel')
  })

  it('routes /industry/eval/intent to the Intent Lab slot', () => {
    expect(resolveAppRoute('/industry/eval/intent')).toBe('industry-eval-intent')
    expect(routePath('industry-eval-intent')).toBe('/industry/eval/intent')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/intent" intentLab={<div>Intent Lab sentinel</div>} />)).toContain('Intent Lab sentinel')
  })

  it('routes mutation evaluation workbench and result pages before generic eval', () => {
    expect(resolveAppRoute('/industry/eval/mutation')).toBe('industry-eval-mutation')
    expect(routePath('industry-eval-mutation')).toBe('/industry/eval/mutation')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/mutation" mutationEval={<div>Mutation Eval sentinel</div>} />)).toContain('Mutation Eval sentinel')

    const path = mutationEvalRunPath('run mutation/guarded')
    expect(path).toBe('/industry/eval/runs/run%20mutation%2Fguarded/mutation')
    expect(resolveAppRoute(path)).toBe('industry-eval-mutation-run')
    expect(mutationEvalRunIdFromPath(path)).toBe('run mutation/guarded')
    expect(renderToStaticMarkup(<AppShell initialPath={path} mutationEval={<div>Mutation Eval run sentinel</div>} />)).toContain('Mutation Eval run sentinel')
  })

  it('routes retrieval playground aliases to the Retrieval Lab slot', () => {
    expect(resolveAppRoute('/industry/eval/playground/retrieval')).toBe('industry-eval-retrieval')
    expect(resolveAppRoute('/industry/eval/retrieval')).toBe('industry-eval-retrieval')
    expect(routePath('industry-eval-retrieval')).toBe('/industry/eval/playground/retrieval')
    expect(renderToStaticMarkup(<AppShell initialPath="/industry/eval/playground/retrieval" retrievalLab={<div>Retrieval Lab sentinel</div>} />)).toContain('Retrieval Lab sentinel')
  })

  it('routes retrieval run detail with safe run id decoding', () => {
    const path = retrievalRunPath('run candidate/2')
    expect(path).toBe('/industry/eval/runs/run%20candidate%2F2/retrieval')
    expect(resolveAppRoute(path)).toBe('industry-eval-retrieval-run')
    expect(retrievalRunIdFromPath(path)).toBe('run candidate/2')
    expect(renderToStaticMarkup(<AppShell initialPath={path} retrievalRun={<div>Retrieval run sentinel</div>} />)).toContain('Retrieval run sentinel')
  })

  it('renders the coding chat slot for /chat', () => {
    expect(renderToStaticMarkup(<AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />)).toContain('Coding chat sentinel')
  })
})
