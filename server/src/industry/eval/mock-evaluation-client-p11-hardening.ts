import './mock-evaluation-client-p11'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

const originalAcceptBaseline = MockEvaluationClient.prototype.acceptUnifiedBaseline
const originalCompare = MockEvaluationClient.prototype.compareUnifiedRuns

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
