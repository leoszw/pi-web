import http from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachBridge } from './bridge'
import { createRequestHandler } from './static'

const HOME = process.env.HOME ?? ''
const PI_REPO = process.env.PI_REPO ?? join(HOME, 'IdeaProjects', 'pi')
const PI_CWD = process.env.PI_CWD ?? PI_REPO
const DEFAULT_PI_CMD: string[] = [
  'node',
  join(PI_REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  '--tsconfig',
  join(PI_REPO, 'tsconfig.json'),
  join(PI_REPO, 'packages', 'coding-agent', 'src', 'experimental', 'cli.ts'),
]

function parsePiCommand(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULT_PI_CMD
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((entry: unknown) => typeof entry === 'string')) {
      return parsed
    }
  } catch {
    // invalid JSON falls through to the default below
  }
  console.error('[pi-web] invalid PI_CMD, falling back to default')
  return DEFAULT_PI_CMD
}

const parsedPort = Number.parseInt(process.env.PI_PORT ?? process.env.PORT ?? '3210', 10)
const PORT = Number.isFinite(parsedPort) ? parsedPort : 3210
const PI_CMD = parsePiCommand(process.env.PI_CMD)

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))

const server = http.createServer(createRequestHandler(webDist))
attachBridge({ server, piCommand: PI_CMD, piCwd: PI_CWD })
server.listen(PORT, '127.0.0.1', () => {
  console.log(`pi-web: http://127.0.0.1:${PORT} (pi cwd: ${PI_CWD})`)
})
