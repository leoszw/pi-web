import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IndustryDashboard } from '../src/features/industry-dashboard/IndustryDashboard'

describe('IndustryDashboard', () => {
  it('states the P1 evaluation mock and no-infrastructure boundary', () => {
    const html = renderToStaticMarkup(<IndustryDashboard />)
    expect(html).toContain('控制台 · P1')
    expect(html).toContain('评测工作台')
    expect(html).toContain('确定性模拟')
    expect(html).toContain('不连接 MySQL')
    expect(html).toContain('OpenSearch')
  })
})
