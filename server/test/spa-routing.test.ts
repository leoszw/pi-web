import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createRequestHandler } from '../src/static'

test('SPA deep links serve index.html while missing assets remain 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-spa-routing-'))
  await writeFile(join(dir, 'index.html'), '<html>app-shell</html>')

  const server = http.createServer(createRequestHandler(dir))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')
  const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`

  try {
    for (const path of ['/chat', '/industry', '/industry/traces']) {
      const response = await fetch(`${baseUrl}${path}`)
      assert.equal(response.status, 200)
      assert.equal(await response.text(), '<html>app-shell</html>')
    }

    const missingAsset = await fetch(`${baseUrl}/missing.js`)
    assert.equal(missingAsset.status, 404)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
