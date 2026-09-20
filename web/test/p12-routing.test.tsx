import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import { resolveAppRoute, routePath } from '../src/app/routes'

describe('P12 routing',()=>{
  it('routes Online Quality before the generic industry catch-all',()=>{
    expect(resolveAppRoute('/industry/quality')).toBe('industry-quality')
    expect(resolveAppRoute('/industry/quality/feedback')).toBe('industry-quality')
    expect(routePath('industry-quality')).toBe('/industry/quality')
    const html=renderToStaticMarkup(<AppShell initialPath="/industry/quality" onlineQuality={<div>在线质量 sentinel</div>}/>)
    expect(html).toContain('在线质量 sentinel')
    expect(html).toContain('质量')
  })
})
