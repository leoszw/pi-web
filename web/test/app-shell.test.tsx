import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import { resolveAppRoute, routePath } from '../src/app/routes'

describe('AppShell routing', () => {
  it('keeps root and chat paths on the existing coding chat', () => {
    expect(resolveAppRoute('/')).toBe('chat')
    expect(resolveAppRoute('/chat')).toBe('chat')
    expect(routePath('chat')).toBe('/chat')
  })

  it('renders the industry dashboard for /industry', () => {
    const html = renderToStaticMarkup(
      <AppShell initialPath="/industry" codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Industry Agent')
    expect(html).toContain('Control Plane foundation is active')
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

  it('renders the coding chat slot for /chat', () => {
    const html = renderToStaticMarkup(
      <AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Coding chat sentinel')
  })
})
