import { describe, expect, it, vi } from 'vitest'
import { createP12ApiClient } from '../src/api/p12-client'

describe('P12 API client',()=>{
  it('creates feedback from trace without trusted scope or Golden fields',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({apiVersion:'eval-api-v1',data:{feedbackId:'f1'}}),{status:201,headers:{'content-type':'application/json'}})) as unknown as typeof fetch
    const client=createP12ApiClient(fetcher)
    await client.createFeedbackFromTrace({traceId:'trace project/1',targetDomain:'RETRIEVAL'})
    const[path,init]=vi.mocked(fetcher).mock.calls[0]!
    expect(path).toBe('/api/industry/v1/quality/feedback/from-trace')
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>
    expect(body).toEqual({traceId:'trace project/1',targetDomain:'RETRIEVAL'})
    expect(body).not.toHaveProperty('projectId');expect(body).not.toHaveProperty('userId');expect(body).not.toHaveProperty('golden');expect(body).not.toHaveProperty('reviewed')
  })
  it('uses exact staged action payloads and never emits promotion fields',async()=>{
    const calls:Array<{path:string;body:unknown}>=[]
    const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(input),body:init?.body===undefined?undefined:JSON.parse(String(init.body))});return new Response(JSON.stringify({apiVersion:'eval-api-v1',data:{feedbackId:'f1'}}),{status:200,headers:{'content-type':'application/json'}})}) as unknown as typeof fetch
    const client=createP12ApiClient(fetcher)
    await client.advanceToDraft('feedback /1')
    await client.labelFeedback('feedback /1',{label:'RAG_INSUFFICIENT_EVIDENCE',tags:['rag','online'],difficulty:'HARD',notes:'human label'})
    await client.reviewFeedback('feedback /1',{approved:true,reviewNote:'checked'})
    await client.versionFeedback('feedback /1')
    expect(calls.map((call)=>call.path)).toEqual(['/api/industry/v1/quality/feedback/feedback%20%2F1/draft','/api/industry/v1/quality/feedback/feedback%20%2F1/label','/api/industry/v1/quality/feedback/feedback%20%2F1/review','/api/industry/v1/quality/feedback/feedback%20%2F1/version'])
    expect(calls.map((call)=>call.body)).toEqual([{}, {label:'RAG_INSUFFICIENT_EVIDENCE',tags:['rag','online'],difficulty:'HARD',notes:'human label'}, {approved:true,reviewNote:'checked'}, {}])
    expect(JSON.stringify(calls)).not.toMatch(/golden|promote|projectId|reviewedBy/iu)
  })
})
