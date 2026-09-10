import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachBridge } from './bridge'

const PORT = Number(process.env.PORT ?? 3210)
const HOME = process.env.HOME ?? ''
const PI_REPO = process.env.PI_REPO ?? join(HOME, 'IdeaProjects', 'pi')
const PI_CWD = process.env.PI_CWD ?? PI_REPO
const PI_CMD: string[] = process.env.PI_CMD
  ? (JSON.parse(process.env.PI_CMD) as string[])
  : [
      'node',
      join(PI_REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      '--tsconfig',
      join(PI_REPO, 'tsconfig.json'),
      join(PI_REPO, 'packages', 'coding-agent', 'src', 'experimental', 'cli.ts'),
    ]

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'
    const filePath = normalize(join(webDist, pathname))
    if (!filePath.startsWith(webDist + sep) && filePath !== join(webDist, 'index.html')) {
      res.writeHead(403)
      res.end()
      return
    }
    const data = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

attachBridge({ server, piCommand: PI_CMD, piCwd: PI_CWD })
server.listen(PORT, '127.0.0.1', () => {
  console.log(`pi-web: http://127.0.0.1:${PORT} (pi cwd: ${PI_CWD})`)
})
