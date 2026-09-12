import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

export function createRequestHandler(webDist: string): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/') pathname = '/index.html'
      if (req.method !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' })
        res.end()
        return
      }

      const requestedPath = safeFilePath(webDist, pathname)
      try {
        const data = await readFile(requestedPath)
        sendFile(res, requestedPath, data)
        return
      } catch {
        if (!isSpaRoute(pathname)) throw new Error('not found')
      }

      const indexPath = safeFilePath(webDist, '/index.html')
      const index = await readFile(indexPath)
      sendFile(res, indexPath, index)
    } catch {
      if (!res.headersSent) {
        res.writeHead(404)
      }
      res.end('not found')
    }
  }
}

function safeFilePath(webDist: string, pathname: string): string {
  const filePath = normalize(join(webDist, pathname))
  if (!filePath.startsWith(webDist + sep)) throw new Error('path outside web root')
  return filePath
}

function isSpaRoute(pathname: string): boolean {
  return pathname === '/chat' || pathname === '/industry' || pathname.startsWith('/industry/')
}

function sendFile(res: ServerResponse, filePath: string, data: Buffer): void {
  const headers: Record<string, string> = { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' }
  if (extname(filePath) === '.html') headers['cache-control'] = 'no-cache'
  res.writeHead(200, headers)
  res.end(data)
}
