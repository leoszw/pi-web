import { describe, expect, it, vi } from 'vitest'
import { createP9ApiClient } from '../src/api/p9-client'

describe('P9 API client',()=>{
  it('requests report download authorization without sending scope or a filesystem path',async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({apiVersion:'industry-api-v1',data:{downloadId:'d1',reportId:'r1',fileName:'x.pdf',contentDisposition:'attachment',authorized:true,expiresAt:'2026-09-13T09:00:00Z',artifactRef:'mock-report-artifact:r1:x'}}),{status:201,headers:{'content-type':'application/json'}})) as unknown as typeof fetch
    const client=createP9ApiClient(fetcher);await client.requestReportDownload('report project/1')
    const[path,init]=vi.mocked(fetcher).mock.calls[0]!;expect(path).toBe('/api/industry/v1/reports/report%20project%2F1/download');expect(init?.method).toBe('POST');expect(JSON.parse(String(init?.body))).toEqual({});expect(String(init?.body)).not.toContain('projectId');expect(String(init?.body)).not.toContain('path')
  })
  it('starts Sandbox from goal and budget only, never browser SQL/Python/queryId/scope',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({apiVersion:'industry-api-v1',data:{runId:'sandbox-1'}}),{status:201,headers:{'content-type':'application/json'}})) as unknown as typeof fetch
    const client=createP9ApiClient(fetcher);await client.startSandboxRun({goal:'query current project',budget:{maxRows:100,maxBytes:64000,timeoutMs:5000},scenario:'SAFE_READ'})
    const[,init]=vi.mocked(fetcher).mock.calls[0]!;const body=JSON.parse(String(init?.body)) as Record<string,unknown>;expect(body).toEqual({goal:'query current project',budget:{maxRows:100,maxBytes:64000,timeoutMs:5000},scenario:'SAFE_READ'});for(const key of ['generatedSql','sql','pythonSource','queryId','projectId','tenantId','userId','approvalToken'])expect(body).not.toHaveProperty(key)
  })
  it('uses distinct Report and Sandbox P9 eval paths',async()=>{
    const paths:string[]=[];const fetcher=vi.fn(async(input:RequestInfo|URL)=>{paths.push(String(input));return new Response(JSON.stringify({apiVersion:'eval-api-v1',data:[]}),{status:200,headers:{'content-type':'application/json'}})}) as unknown as typeof fetch
    const client=createP9ApiClient(fetcher);await client.listEvalCases('REPORT');await client.listEvalCases('SANDBOX');expect(paths).toEqual(['/api/industry/v1/eval/p9/report/cases','/api/industry/v1/eval/p9/sandbox/cases'])
  })
})
