import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import { resolveAppRoute, retrievalRunIdFromPath, retrievalRunPath, routePath } from '../src/app/routes'

describe('AppShell routing', () => {
  it('keeps root and chat paths on the existing coding chat', () => {
    expect(resolveAppRoute('/')).toBe('chat')
    expect(resolveAppRoute('/chat')).toBe('chat')
    expect(routePath('chat')).toBe('/chat')
  })

  it('routes /industry to the P3 workspace slot', () => {
    expect(resolveAppRoute('/industry')).toBe('industry')
    const html = renderToStaticMarkup(
      <AppShell initialPath="/industry" industryWorkspace={<div>Industry Workspace sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Industry Workspace sentinel')
    expect(html).not.toContain('Coding chat sentinel')
  })

  it('routes /industry/eval to the evaluation overview slot', () => {
    expect(resolveAppRoute('/industry/eval')).toBe('industry-eval')
    expect(routePath('industry-eval')).toBe('/industry/eval')
    const html = renderToStaticMarkup(
      <AppShell initialPath="/industry/eval" evalOverview={<div>Eval overview sentinel</div>} codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Eval overview sentinel')
    expect(html).not.toContain('Coding chat sentinel')
  })

  it('routes /industry/eval/intent to the Intent Lab slot', () => {
    expect(resolveAppRoute('/industry/eval/intent')).toBe('industry-eval-intent')
    expect(routePath('industry-eval-intent')).toBe('/industry/eval/intent')
    const html = renderToStaticMarkup(
      <AppShell initialPath="/industry/eval/intent" intentLab={<div>Intent Lab sentinel</div>} />,
    )
    expect(html).toContain('Intent Lab sentinel')
  })

  it('routes retrieval playground aliases to the Retrieval Lab slot', () => {
    expect(resolveAppRoute('/industry/eval/playground/retrieval')).toBe('industry-eval-retrieval')
    expect(resolveAppRoute('/industry/eval/retrieval')).toBe('industry-eval-retrieval')
    expect(routePath('industry-eval-retrieval')).toBe('/industry/eval/playground/retrieval')
    const html = renderToStaticMarkup(
      <AppShell initialPath="/industry/eval/playground/retrieval" retrievalLab={<div>Retrieval Lab sentinel</div>} />,
    )
    expect(html).toContain('Retrieval Lab sentinel')
  })

  it('routes retrieval run detail with safe run id decoding', () => {
    const path = retrievalRunPath('run candidate/2')
    expect(path).toBe('/industry/eval/runs/run%20candidate%2F2/retrieval')
    expect(resolveAppRoute(path)).toBe('industry-eval-retrieval-run')
    expect(retrievalRunIdFromPath(path)).toBe('run candidate/2')
    const html = renderToStaticMarkup(
      <AppShell initialPath={path} retrievalRun={<div>Retrieval run sentinel</div>} />,
    )
    expect(html).toContain('Retrieval run sentinel')
  })

  it('renders the coding chat slot for /chat', () => {
    const html = renderToStaticMarkup(
      <AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Coding chat sentinel')
  })
})
