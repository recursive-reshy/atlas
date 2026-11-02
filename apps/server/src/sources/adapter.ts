// Shared
import type { Job, SourceDocument } from '@atlas/shared'
// Services
import type { StepStatus, TranscriptionAttempt } from '../services/jobs.service.js'

export interface AdapterContext {
  job: Job
  workDir: string
  markStatus: ( status: StepStatus ) => void
  // Called once an upload to the transcription API has been tried (ADR 0074)
  recordTranscription: ( attempt: TranscriptionAttempt ) => void
}

export interface SourceAdapter {
  acquire: ( context: AdapterContext ) => Promise< SourceDocument >
}
