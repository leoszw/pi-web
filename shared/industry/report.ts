export type ReportFormat = 'PDF' | 'XLSX' | 'SVG' | 'CSV'
export type ReportStatus = 'READY' | 'BLOCKED'

export interface ReportEvidenceItem {
  evidenceId: string
  label: string
  sourceType: 'TRACE' | 'RAG_CHUNK' | 'QUERY_RESULT' | 'MANUAL'
  sourceRef: string
  covered: boolean
}

export interface ReportLineageNode {
  nodeId: string
  type: 'SOURCE' | 'TRANSFORM' | 'REPORT'
  label: string
  parentIds: readonly string[]
}

export interface ReportSecuritySummary {
  hiddenFieldBlocked: boolean
  activeContentBlocked: boolean
  externalLinksBlocked: boolean
  macroBlocked: boolean
  pdfActionsBlocked: boolean
  svgScriptsBlocked: boolean
  safePath: boolean
  sizeWithinLimit: boolean
  completedWithinTimeout: boolean
}

export interface ReportArtifact {
  reportId: string
  projectId: string
  title: string
  format: ReportFormat
  fileName: string
  sizeBytes: number
  status: ReportStatus
  mimeType: string
  preview: string
  metadata: Readonly<Record<string, string>>
  evidence: readonly ReportEvidenceItem[]
  lineage: readonly ReportLineageNode[]
  security: ReportSecuritySummary
  traceId: string
  createdAt: string
}

export interface ReportDownloadGrant {
  downloadId: string
  reportId: string
  fileName: string
  contentDisposition: 'attachment'
  authorized: true
  expiresAt: string
  artifactRef: string
}
