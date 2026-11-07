// Melete
import { estimateCostUsd } from '../summarizer/pricing.js'
// Repositories
import { insertRun } from '../repositories/meleteRuns.repository.js'

type RunDetails = {
  kind: 'generate' | 'grade' | 'syllabus' | 'map' | 'suggest'
  noteId?: string
  questionId?: string
  subjectId?: string
  model: string
  promptVersionId: number
  usage: { input_tokens: number, output_tokens: number } | undefined
  error?: string
  now: Date
}

// Every Claude attempt leaves a row; tokens and cost are null when the call gave none
export const recordMeleteRun = ( userId: string, details: RunDetails ): number => {
  const { kind, noteId, questionId, subjectId, model, promptVersionId, usage, error, now } = details
  const inputTokens = usage?.input_tokens ?? null
  const outputTokens = usage?.output_tokens ?? null

  return insertRun( userId, {
    kind,
    note_id: noteId ?? null,
    question_id: questionId ?? null,
    subject_id: subjectId ?? null,
    model,
    prompt_version_id: promptVersionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd( model, inputTokens, outputTokens ),
    outcome: error === undefined ? 'succeeded' : 'failed',
    error: error ?? null,
    created_at: now.toISOString(),
  } )
}
