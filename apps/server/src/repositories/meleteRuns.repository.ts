// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const NewMeleteRun = z.object( {
  kind: z.enum( [ 'generate', 'grade', 'syllabus', 'map', 'suggest' ] ),
  note_id: z.string().nullable(),
  question_id: z.string().nullable(),
  subject_id: z.string().nullable(),
  model: z.string(),
  prompt_version_id: z.int(),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  error: z.string().nullable(),
  // Set for agent runs only (migration 18)
  turns: z.int().nullable(),
  tool_calls: z.int().nullable(),
  created_at: z.string(),
} )
export type NewMeleteRun = z.infer< typeof NewMeleteRun >

export const MeleteRunRecord = NewMeleteRun.extend( { id: z.int() } )
export type MeleteRunRecord = z.infer< typeof MeleteRunRecord >

export const insertRun = ( userId: string, run: NewMeleteRun ): number => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO melete_runs (
        user_id, kind, note_id, question_id, subject_id, model, prompt_version_id,
        input_tokens, output_tokens, cost_usd, outcome, error, turns, tool_calls, created_at
      ) VALUES (
        @user_id, @kind, @note_id, @question_id, @subject_id, @model, @prompt_version_id,
        @input_tokens, @output_tokens, @cost_usd, @outcome, @error, @turns, @tool_calls, @created_at
      )` )
    .run( { ...run, user_id: userId } )

  return Number( lastInsertRowid )
}

export const findRun = ( userId: string, id: number ): MeleteRunRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM melete_runs WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : MeleteRunRecord.parse( row )
}
