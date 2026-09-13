import './mock-evaluation-client-p11'
import type { UnifiedBenchmarkRun, UnifiedReleaseDecision } from '../../../../shared/industry/eval/p11'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

const originalAcceptBaseline = MockEvaluationClient.prototype.acceptUnifiedBaseline
const originalCompare = MockEvaluationClient.prototype.compareUnifiedRuns
const originalListRuns = MockEvaluationClient.prototype.listUnifiedBenchmarkRuns
const originalStartRun = MockEvaluationClient.prototype.startUnifiedBenchmarkRun
const originalGetRun = MockEvaluationClient.prototype.getUnifiedBenchmarkRun
const originalGetDecision = MockEvaluationClient.prototype.getUnifiedReleaseDecision

function mockGateRun(run: UnifiedBenchmarkRun): UnifiedBenchmarkRun {
  return { ...run, releaseGate: { ...run.releaseGate, source: 'MOCK_PI' } }
}

function mockGateDecision(decision: UnifiedReleaseDecision): UnifiedReleaseDecision {
  return { ...decision, gate: { ...decision.gate, source: 'MOCK_PI' } }
}

MockEvaluationClient.prototype.listUnifiedBenchmarkRuns = async function listUnifiedBenchmarkRuns(context) {
  return (await originalListRuns.call(this, context)).map(mockGateRun)
}

MockEvaluationClient.prototype.startUnifiedBenchmarkRun = async function startUnifiedBenchmarkRun(context, request) {
  return mockGateRun(await originalStartRun.call(this, context, request))
}

MockEvaluationClient.prototype.getUnifiedBenchmarkRun = async function getUnifiedBenchmarkRun(context, runId) {
  return mockGateRun(await originalGetRun.call(this, context, runId))
}

MockEvaluationClient.prototype.getUnifiedReleaseDecision = async function getUnifiedReleaseDecision(context, runId) {
  return mockGateDecision(await originalGetDecision.call(this, context, runId))
}

MockEvaluationClient.prototype.acceptUnifiedBaseline = async function acceptUnifiedBaseline(context, runId) {
  const [run, manifest] = await Promise.all([
    this.getUnifiedBenchmarkRun(context, runId),
    this.getUnifiedCorpusManifest(context),
  ])
  if (run.corpusFingerprint !== manifest.fingerprint || run.corpusVersion !== manifest.version) {
    throw new EvaluationClientError('EVAL_BASELINE_CORPUS_STALE', 'baseline run must use the current reviewed corpus fingerprint and version', 409)
  }
  if (run.coveredCaseCount !== manifest.totalCaseCount || run.coverageRate !== 1) {
    throw new EvaluationClientError('EVAL_BASELINE_COVERAGE_INCOMPLETE', `baseline run must cover exactly ${manifest.totalCaseCount} cases`, 409)
  }
  return originalAcceptBaseline.call(this, context, runId)
}

MockEvaluationClient.prototype.compareUnifiedRuns = async function compareUnifiedRuns(context, baselineRunId, candidateRunId) {
  const [comparison, baseline, candidate] = await Promise.all([
    originalCompare.call(this, context, baselineRunId, candidateRunId),
    this.getUnifiedBenchmarkRun(context, baselineRunId),
    this.getUnifiedBenchmarkRun(context, candidateRunId),
  ])
  const keys = [...new Set([
    ...Object.keys(baseline.reproducibility.componentVersions),
    ...Object.keys(candidate.reproducibility.componentVersions),
  ])].sort()
  return {
    ...comparison,
    versionDiff: keys.map((component) => {
      const before = baseline.reproducibility.componentVersions[component] ?? 'missing'
      const after = candidate.reproducibility.componentVersions[component] ?? 'missing'
      return { component, before, after, changed: before !== after }
    }),
  }
}
