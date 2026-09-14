import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IndustryDashboard } from '../src/features/industry-dashboard/IndustryDashboard'

describe('IndustryDashboard', () => {
  it('states the P1 evaluation mock and no-infrastructure boundary', () => {
    const html = renderToStaticMarkup(<IndustryDashboard />)
    expect(html).toContain('Control Plane · P1')
    expect(html).toContain('Evaluation Workbench')
    expect(html).toContain('deterministic mock')
    expect(html).toContain('does not connect to MySQL')
    expect(html).toContain('OpenSearch')
  })
})
