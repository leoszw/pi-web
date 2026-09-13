export type AgentLoopPhase = 'PLAN' | 'ACT' | 'VERIFY' | 'REPLAN' | 'TERMINATE'
export type AgentLoopRunStatus = 'COMPLETED' | 'TERMINATED' | 'FAILED'
export type AgentLoopTerminationReason =
  | 'SUCCESS'
  | 'MAX_STEPS'
  | 'MAX_TOOLS'
  | 'TOKEN_BUDGET'
  | 'COST_BUDGET'
  | 'TIMEOUT'
  | 'USAGE_INCOMPLETE'
  | 'SCOPE_INJECTION_BLOCKED'
  | 'CRITICAL_TOOL_CONFIRMATION_REQUIRED'
  | 'ERROR'

export interface AgentLoopBudget {
  maxSteps: number
  maxTools: number
  maxTokens: number
  maxCostUsd: number
  timeoutMs: number
}

export interface AgentLoopUsage {
  steps: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  elapsedMs: number
  complete: boolean
}

export interface AgentLoopStep {
  sequenceNo: number
  phase: AgentLoopPhase
  status: 'OK' | 'BLOCKED' | 'ERROR'
  title: string
  detail: string
  toolName?: string
  toolCritical?: boolean
  scopeInjectionBlocked?: boolean
  tokenUsage: number
  costUsd: number
  startedAt: string
  completedAt: string
}

export interface AgentLoopRun {
  runId: string
  projectId: string
  goal: string
  status: AgentLoopRunStatus
  budget: AgentLoopBudget
  usage: AgentLoopUsage
  steps: readonly AgentLoopStep[]
  terminationReason: AgentLoopTerminationReason
  traceId: string
  createdAt: string
  completedAt: string
}

export interface StartAgentLoopRunRequest {
  goal: string
  budget: AgentLoopBudget
  scenario?: 'SUCCESS' | 'REPLAN' | 'MAX_STEPS' | 'MAX_TOOLS' | 'TOKEN_COST' | 'TIMEOUT' | 'USAGE_INCOMPLETE' | 'SCOPE_INJECTION' | 'CRITICAL_TOOL'
}
