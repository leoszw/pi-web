import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'web/src/styles.css'), 'utf8')

test('modal backdrop uses viewport-level grid centering', () => {
  expect(styles).toMatch(/\.modal-backdrop\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s)
})

test('chat messages preserve automatic horizontal margins for centering', () => {
  expect(styles).toMatch(/\.user-message\s*\{[^}]*margin:\s*8px\s+auto;/s)
  expect(styles).toMatch(/\.assistant-message\s*\{[^}]*margin:\s*12px\s+auto;/s)
  expect(styles).toMatch(/\.tool-card\s*\{[^}]*margin:\s*8px\s+auto;/s)
})
