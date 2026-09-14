import { describe, expect, it, vi } from 'vitest'
import { createP10ApiClient } from '../src/api/p10-client'

describe('P10 API client',()=>{
  it('creates runtime drafts with alias changes only',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({apiVersion:'industry-api-v1',data:{draftId:'d1'}}),{status:201,headers:{'content-type':'application/json'}})) as unknown as typeof fetch
    const client=createP10ApiClient(fetcher)
    await client.createRuntimeConfigDraft({changes:[{component:'AGENT_MODEL',adapter:'mock-agent-model-v2',endpointAlias:'agent-model-candidate'}]})
    const[path,init]=vi.mocked(fetcher).mock.calls[0]!
    expect(path).toBe('/api/industry/v1/runtime/config/drafts')
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>
    expect(body).toEqual({changes:[{component:'AGENT_MODEL',adapter:'mock-agent-model-v2',endpointAlias:'agent-model-candidate'}]})
    expect(body).not.toHaveProperty('projectId');expect(body).not.toHaveProperty('secret');expect(body).not.toHaveProperty('promote')
  })
  it('uses empty bodies for validate save and eval and has no promote request',async()=>{
    const paths:string[]=[];const bodies:unknown[]=[]
    const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{paths.push(String(input));bodies.push(init?.body===undefined?undefined:JSON.parse(String(init.body)));return new Response(JSON.stringify({apiVersion:'industry-api-v1',data:{draftId:'d1'}}),{status:200,headers:{'content-type':'application/json'}})}) as unknown as typeof fetch
    const client=createP10ApiClient(fetcher);await client.validateRuntimeConfigDraft('draft /1');await client.saveRuntimeConfigDraft('draft /1');await client.evaluateRuntimeConfigDraft('draft /1')
    expect(paths).toEqual(['/api/industry/v1/runtime/config/drafts/draft%20%2F1/validate','/api/industry/v1/runtime/config/drafts/draft%20%2F1/save','/api/industry/v1/runtime/config/drafts/draft%20%2F1/eval']);expect(bodies).toEqual([{}, {}, {}])
  })
  it('reads operations readiness through a dedicated GET endpoint',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({apiVersion:'industry-api-v1',data:{environment:'MOCK',projectId:'p1',overall:'NOT_READY',checks:[],lastUpdatedAt:'x'}}),{status:200,headers:{'content-type':'application/json'}})) as unknown as typeof fetch
    const client=createP10ApiClient(fetcher);await client.getOperationsReadiness();expect(vi.mocked(fetcher).mock.calls[0]?.[0]).toBe('/api/industry/v1/operations/readiness');expect(vi.mocked(fetcher).mock.calls[0]?.[1]?.method).toBe('GET')
  })
})
