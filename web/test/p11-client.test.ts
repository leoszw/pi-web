import { describe, expect, it, vi } from 'vitest'
import { createP11ApiClient } from '../src/api/p11-client'

function ok(data:unknown,status=200){return new Response(JSON.stringify({apiVersion:'eval-api-v1',data}),{status,headers:{'content-type':'application/json'}})}

describe('P11 API client',()=>{
  it('starts benchmark runs without trusted scope or gate fields',async()=>{
    const fetcher=vi.fn(async()=>ok({runId:'r1'},201)) as unknown as typeof fetch
    const client=createP11ApiClient(fetcher);await client.startRun({corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1'})
    const[path,init]=vi.mocked(fetcher).mock.calls[0]!
    expect(path).toBe('/api/industry/v1/eval/p11/runs');expect(init?.method).toBe('POST')
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;expect(body).toEqual({corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1'});expect(body).not.toHaveProperty('projectId');expect(body).not.toHaveProperty('gate');expect(body).not.toHaveProperty('manualPass')
  })
  it('uses empty explicit-baseline body and separate waiver payload',async()=>{
    const fetcher=vi.fn(async()=>ok({})) as unknown as typeof fetch;const client=createP11ApiClient(fetcher)
    await client.acceptBaseline('run /1');await client.createWaiver('run /1',{reason:'documented temporary exception for controlled release',expiresAt:'2026-09-14T00:00:00.000Z'})
    const first=vi.mocked(fetcher).mock.calls[0]!;const second=vi.mocked(fetcher).mock.calls[1]!
    expect(first[0]).toBe('/api/industry/v1/eval/p11/runs/run%20%2F1/accept-baseline');expect(JSON.parse(String(first[1]?.body))).toEqual({})
    expect(second[0]).toBe('/api/industry/v1/eval/p11/runs/run%20%2F1/waivers');const body=JSON.parse(String(second[1]?.body)) as Record<string,unknown>;expect(body).toEqual({reason:'documented temporary exception for controlled release',expiresAt:'2026-09-14T00:00:00.000Z'});expect(body).not.toHaveProperty('gate');expect(body).not.toHaveProperty('projectId');expect(body).not.toHaveProperty('releaseDisposition')
  })
  it('uses dedicated compare and gate endpoints',async()=>{
    const paths:string[]=[];const fetcher=vi.fn(async(input:RequestInfo|URL)=>{paths.push(String(input));return ok({})}) as unknown as typeof fetch;const client=createP11ApiClient(fetcher)
    await client.getDecision('run x');await client.compare('baseline /1','candidate /2');await client.getBaseline();await client.listWaivers()
    expect(paths).toEqual(['/api/industry/v1/eval/p11/runs/run%20x/gate','/api/industry/v1/eval/p11/compare','/api/industry/v1/eval/p11/baseline','/api/industry/v1/eval/p11/waivers'])
  })
})
