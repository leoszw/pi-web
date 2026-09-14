export type MultimodalReviewStatus = 'PENDING' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED'

export interface ImageInputMetadata {
  fileName: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface MultimodalFieldObservation {
  name: string
  value: string
  confidence: number
  missing: boolean
}

export interface MultimodalEntityCandidate {
  entityId: string
  entityType: 'ENGINEERING_POSITION' | 'BOQ_ITEM' | 'EQUIPMENT' | 'UNKNOWN'
  name: string
  confidence: number
}

export interface MultimodalObservation {
  observationId: string
  label: string
  confidence: number
  bbox?: BoundingBox
  fields: readonly MultimodalFieldObservation[]
  entityCandidates: readonly MultimodalEntityCandidate[]
  selectedEntityId?: string
  missingFields: readonly string[]
  lowConfidence: boolean
  reviewStatus: MultimodalReviewStatus
  reviewNote?: string
}

export interface MultimodalAnalysis {
  analysisId: string
  projectId: string
  image: ImageInputMetadata
  observations: readonly MultimodalObservation[]
  noEvidence: boolean
  promptInjectionBlocked: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateMultimodalAnalysisRequest extends ImageInputMetadata {}

export interface ReviewMultimodalObservationRequest {
  decision: 'ACCEPT' | 'CORRECT' | 'REJECT'
  selectedEntityId?: string
  correctedFields?: Readonly<Record<string, string>>
  note?: string
}
