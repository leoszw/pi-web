import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const selectorSource = readFileSync(resolve(process.cwd(), 'web/src/app/ProjectSelector.tsx'), 'utf8')
const shellSource = readFileSync(resolve(process.cwd(), 'web/src/app/AppShell.tsx'), 'utf8')

test('project selector stays hidden when the industry control plane is unavailable', () => {
  expect(selectorSource).toContain("reason.code === 'INDUSTRY_CONTROL_PLANE_DISABLED'")
  expect(selectorSource).toContain("if (status !== 'ready') return null")
})

test('successful project changes invalidate mounted industry page state', () => {
  expect(selectorSource).toContain('onProjectChanged?.(nextProjectId)')
  expect(shellSource).toContain("const contentScopeKey=route==='chat'?'chat':`industry-${projectScopeVersion}`")
  expect(shellSource).toContain('<AppContent key={contentScopeKey}')
})
