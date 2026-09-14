import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../src/app/AppShell'
import { resolveAppRoute, routePath } from '../src/app/routes'

describe('P11 benchmark routing',()=>{
  it('routes unified benchmark before generic evaluation catch-all',()=>{
    expect(resolveAppRoute('/industry/eval/benchmark')).toBe('industry-eval-benchmark')
    expect(resolveAppRoute('/industry/eval/benchmark/')).toBe('industry-eval-benchmark')
    expect(routePath('industry-eval-benchmark')).toBe('/industry/eval/benchmark')
    const html=renderToStaticMarkup(<AppShell initialPath="/industry/eval/benchmark" unifiedBenchmark={<div>P11 Benchmark sentinel</div>}/>)
    expect(html).toContain('P11 Benchmark sentinel')
  })
})
