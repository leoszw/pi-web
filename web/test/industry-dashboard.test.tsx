import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IndustryDashboard } from '../src/features/industry-dashboard/IndustryDashboard'

describe('IndustryDashboard', () => {
  it('states the P0 mock and no-infrastructure boundary', () => {
    const html = renderToStaticMarkup(<IndustryDashboard />)
    expect(html).toContain('Control Plane · P0')
    expect(html).toContain('mock IndustryAgentClient')
    expect(html).toContain('does not connect to')
    expect(html).toContain('MySQL')
    expect(html).toContain('OpenSearch')
  })
})
