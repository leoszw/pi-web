import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-p11'
import '../src/industry/eval/mock-evaluation-client-p11-hardening'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'

const context:TrustedRequestContext={requestId:'request-p11-hardening',userId:'reviewer-p11',tenantId:'tenant-1',companyId:'company-1',projectId:'project-1',roles:['project-user'],permissions:['eval.read','eval.baseline.accept'],sessionId:'session-p11-hardening'}

test('P11 baseline hardening binds acceptance to the current reviewed manifest fingerprint',async()=>{
  const client=new MockEvaluationClient()
  const original=client.getUnifiedBenchmarkRun.bind(client)
  client.getUnifiedBenchmarkRun=async(ctx,runId)=>{const run=await original(ctx,runId);return{...run,corpusFingerprint:`sha256:${'0'.repeat(64)}`}}
  await assert.rejects(()=>client.acceptUnifiedBaseline(context,'run-p11-candidate-v2'),(error:unknown)=>error instanceof Error&&'code'in error&&(error as {code:string}).code==='EVAL_BASELINE_CORPUS_STALE')
})

test('P11 compare version diff covers the full reproducibility component snapshot',async()=>{
  const client=new MockEvaluationClient()
  const comparison=await client.compareUnifiedRuns(context,'run-p11-baseline-v1','run-p11-candidate-v2')
  assert.deepEqual(comparison.versionDiff.map((item)=>item.component),['agentModel','parser','reranker','sandbox'])
  assert.equal(comparison.versionDiff.find((item)=>item.component==='agentModel')?.changed,true)
  assert.equal(comparison.versionDiff.find((item)=>item.component==='parser')?.changed,false)
})

test('P11 mock hardening never presents deterministic fixture gates as real PI provenance',async()=>{
  const client=new MockEvaluationClient()
  const runs=await client.listUnifiedBenchmarkRuns(context)
  assert.ok(runs.length>0)
  assert.ok(runs.every((run)=>run.releaseGate.source==='MOCK_PI'))
  const created=await client.startUnifiedBenchmarkRun(context,{corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1'})
  assert.equal(created.releaseGate.source,'MOCK_PI')
  const detail=await client.getUnifiedBenchmarkRun(context,created.runId)
  assert.equal(detail.releaseGate.source,'MOCK_PI')
  const decision=await client.getUnifiedReleaseDecision(context,created.runId)
  assert.equal(decision.gate.source,'MOCK_PI')
})
