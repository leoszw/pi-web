import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequestHandler } from '../src/static'

interface StaticResponse {
  status: number | undefined
  headers: http.IncomingHttpHeaders
  body: string
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
  })
}

function request(port: number, path: string, method = 'GET'): Promise<StaticResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        body += chunk
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('GET /index.html serves html with no-cache and cannot be framed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-static-'))
  const server = http.createServer(createRequestHandler(dir))
  try {
    await writeFile(join(dir, 'index.html'), '<html>index</html>')
    const port = await listen(server)
    const res = await request(port, '/index.html')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
    assert.equal(res.headers['cache-control'], 'no-cache')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['content-security-policy'], "frame-ancestors 'none'")
    assert.equal(res.body, '<html>index</html>')
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('GET / serves index.html', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-static-'))
  const server = http.createServer(createRequestHandler(dir))
  try {
    await writeFile(join(dir, 'index.html'), '<html>root</html>')
    const port = await listen(server)
    const res = await request(port, '/')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
    assert.equal(res.body, '<html>root</html>')
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('traversal attempts are blocked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-static-'))
  const server = http.createServer(createRequestHandler(dir))
  try {
    const port = await listen(server)
    const raw = await request(port, '/../etc/passwd')
    assert.ok(raw.status === 403 || raw.status === 404)
    assert.ok(!raw.body.includes('root:'))
    const encoded = await request(port, '/%2e%2e/etc/passwd')
    assert.ok(encoded.status === 403 || encoded.status === 404)
    assert.ok(!encoded.body.includes('root:'))
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('unknown path returns 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-static-'))
  const server = http.createServer(createRequestHandler(dir))
  try {
    await writeFile(join(dir, 'index.html'), '<html>index</html>')
    const port = await listen(server)
    const res = await request(port, '/nope.js')
    assert.equal(res.status, 404)
    assert.equal(res.body, 'not found')
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('POST returns 405 with allow header', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-web-static-'))
  const server = http.createServer(createRequestHandler(dir))
  try {
    await writeFile(join(dir, 'index.html'), '<html>index</html>')
    const port = await listen(server)
    const res = await request(port, '/index.html', 'POST')
    assert.equal(res.status, 405)
    assert.equal(res.headers.allow, 'GET, HEAD')
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})
