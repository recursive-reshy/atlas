// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const TranscriptionRunRecord = z.object( {
  job_id: z.string(),
  model: z.string(),
  audio_seconds: z.int().min( 0 ),
  input_tokens: z.int().min( 0 ).nullable(),
  output_tokens: z.int().min( 0 ).nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'ok', 'error' ] ),
  error: z.string().nullable(),
  created_at: z.string(),
} )
export type TranscriptionRunRecord = z.infer< typeof TranscriptionRunRecord >

const StoredTranscriptionRun = TranscriptionRunRecord.extend( { id: z.int() } )
export type StoredTranscriptionRun = z.infer< typeof StoredTranscriptionRun >

export const insertTranscriptionRun = (
  userId: string,
  run: TranscriptionRunRecord,
): StoredTranscriptionRun => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO transcription_runs (
        user_id, job_id, model, audio_seconds, pieces, input_tokens, output_tokens, cost_usd,
        outcome, error, created_at
      ) VALUES (
        @user_id, @job_id, @model, @audio_seconds, 1, @input_tokens, @output_tokens, @cost_usd,
        @outcome, @error, @created_at
      )` )
    .run( { ...TranscriptionRunRecord.parse( run ), user_id: userId } )

  return StoredTranscriptionRun.parse( getDatabase()
    .prepare( 'SELECT * FROM transcription_runs WHERE id = ? AND user_id = ?' )
    .get( lastInsertRowid, userId ) )
}

export const listTranscriptionRuns = (
  userId: string,
  jobId: string,
): StoredTranscriptionRun[] => {
  return z.array( StoredTranscriptionRun ).parse( getDatabase()
    .prepare( 'SELECT * FROM transcription_runs WHERE job_id = ? AND user_id = ? ORDER BY id' )
    .all( jobId, userId ) )
}
