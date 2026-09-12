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

  it('renders the coding chat slot for /chat', () => {
    const html = renderToStaticMarkup(
      <AppShell initialPath="/chat" codingChat={<div>Coding chat sentinel</div>} />,
    )
    expect(html).toContain('Coding chat sentinel')
  })
})
