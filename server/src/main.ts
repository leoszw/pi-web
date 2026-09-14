import http from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PiWebMode } from '../../shared/industry/common'
import { attachBridge } from './bridge'
import { MockPrincipalProvider, parseMockPrincipal, type AuthPrincipal } from './industry/auth'
import { MockIndustryAgentClient, parseMockProjects } from './industry/clients/mock-industry-agent-client'
import { IndustryContextService } from './industry/context'
import './industry/eval/mock-evaluation-client-mutation'
import './industry/eval/mock-evaluation-client-p7'
import './industry/eval/mock-evaluation-client-p8'
import './industry/eval/mock-evaluation-client-p9'
import './industry/eval/mock-evaluation-client-p11'
import './industry/eval/mock-evaluation-client-p11-hardening'
import './industry/eval/mock-evaluation-client-p12'
import './industry/eval/mock-evaluation-client-rag'
import './industry/eval/mock-evaluation-client-retrieval'
import './industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from './industry/eval/mock-evaluation-client'
import './industry/knowledge/mock-industry-agent-client-knowledge'
import './industry/p8/mock-industry-agent-client-p8'
import './industry/p9/mock-industry-agent-client-p9'
import './industry/p10/mock-industry-agent-client-p10'
import { createIndustryRouter } from './industry/router'
import './industry/trace/mock-industry-agent-client-retrieval-debug'
import { parseAllowedOrigins } from './security/origin'
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
function parsePiCommand(raw: string | undefined): string[] { if (raw === undefined) return DEFAULT_PI_CMD; try { const parsed:unknown=JSON.parse(raw); if(Array.isArray(parsed)&&parsed.every((entry:unknown)=>typeof entry==='string'))return parsed } catch { /* invalid JSON falls through */ } console.error('[pi-web] invalid PI_CMD, falling back to default'); return DEFAULT_PI_CMD }
function parseMode(raw:string|undefined):PiWebMode{if(raw===undefined||raw==='local')return'local';if(raw==='control-plane')return'control-plane';throw new Error('PI_WEB_MODE must be "local" or "control-plane"')}
function localPrincipal():AuthPrincipal{return{subject:'local',userId:'local',tenantId:'local',companyIds:[],roles:[],permissions:[],sessionId:'local'}}
const parsedPort=Number.parseInt(process.env.PI_PORT??process.env.PORT??'3210',10)
const PORT=Number.isFinite(parsedPort)?parsedPort:3210
const PI_CMD=parsePiCommand(process.env.PI_CMD)
const MODE=parseMode(process.env.PI_WEB_MODE)
const principal=MODE==='control-plane'?parseMockPrincipal(process.env.PI_WEB_MOCK_PRINCIPAL_JSON):localPrincipal()
const projects=MODE==='control-plane'?parseMockProjects(process.env.PI_WEB_MOCK_PROJECTS_JSON):[]
const principalProvider=new MockPrincipalProvider(principal)
const industryClient=new MockIndustryAgentClient(projects)
const evaluationClient=new MockEvaluationClient()
const contextService=new IndustryContextService(industryClient)
const allowedOrigins=parseAllowedOrigins(process.env.PI_WEB_ALLOWED_ORIGINS,PORT)
const webDist=fileURLToPath(new URL('../../web/dist',import.meta.url))
const staticHandler=createRequestHandler(webDist)
const industryRouter=createIndustryRouter({mode:MODE,principalProvider,client:industryClient,evaluationClient,contextService,allowedOrigins})
const server=http.createServer((request,response)=>{void(async()=>{if(await industryRouter(request,response))return;await staticHandler(request,response)})().catch(()=>{if(!response.headersSent)response.writeHead(500);response.end('internal server error')})})
attachBridge({server,piCommand:PI_CMD,piCwd:PI_CWD,mode:MODE,allowedOrigins,principalProvider})
server.listen(PORT,'127.0.0.1',()=>console.log(`pi-web: http://127.0.0.1:${PORT} (mode: ${MODE}, pi cwd: ${PI_CWD})`))
