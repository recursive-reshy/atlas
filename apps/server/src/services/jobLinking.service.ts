// Shared
import type {
  AcceptLinkSuggestionsBody,
  Job,
  LinkSuggestion,
  LinkSuggestionsResponse,
  LinkUsage,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  StoredLinkSuggestion,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError } from '../errors.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { insertLinkRun } from '../repositories/linkRuns.repository.js'
import {
  findSuggestions,
  insertSuggestions,
  listSuggestions,
  setStatus,
  supersedePending,
} from '../repositories/linkSuggestions.repository.js'
// Summarizer
import { estimateCostUsd } from '../summarizer/pricing.js'
// Worker
import { wakeWorker } from '../worker/wake.js'
// Services
import { updateDraft } from './jobDraft.service.js'
import {
  assertFrom,
  moveTo,
  requireJob,
  toPublicJob,
} from './jobs.service.js'

export const completeLinking = ( userId: string, id: string ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'linking', 'ready_for_review' )

  return moveTo( userId, job, 'ready_for_review', { link_state: 'linked', link_error: null } )
}

export const failLinking = ( userId: string, id: string, message: string ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'linking', 'ready_for_review' )

  return moveTo( userId, job, 'ready_for_review', { link_state: 'failed', link_error: message } )
}

export const recordLinkRun = (
  userId: string,
  jobId: string,
  run: {
    model: string
    promptVersionId: number
    usage: LinkUsage | undefined
    error?: string
  },
): number => {
  const inputTokens = run.usage?.input_tokens ?? null
  const outputTokens = run.usage?.output_tokens ?? null

  return insertLinkRun( userId, {
    job_id: jobId,
    model: run.model,
    prompt_version_id: run.promptVersionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: run.usage?.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: run.usage?.cache_creation_input_tokens ?? null,
    tool_calls: run.usage?.tool_calls ?? null,
    cost_usd: estimateCostUsd( run.model, inputTokens, outputTokens ),
    outcome: run.error === undefined ? 'succeeded' : 'failed',
    error: run.error ?? null,
    created_at: new Date().toISOString(),
  } )
}

export const recordLinkSuggestions = (
  userId: string,
  jobId: string,
  runId: number,
  suggestions: LinkSuggestion[],
): void => {
  insertSuggestions( userId, runId, jobId, suggestions )
}

export const listLinkSuggestions = ( userId: string, id: string ): StoredLinkSuggestion[] => {
  requireJob( userId, id )

  return listSuggestions( userId, id )
}

export const runLinking = ( userId: string, id: string, body: RunLinkingBody ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'linking' )

  if( config.agent === null ) {
    throw new ConflictError( 'Linking isn\'t configured' )
  }

  const linking = inTransaction( () => {
    if( body.note_markdown !== undefined ) {
      updateDraft( userId, id, { note_markdown: body.note_markdown } )
    }

    supersedePending( userId, id )

    return moveTo( userId, requireJob( userId, id ), 'linking', {
      link_state: 'pending',
      link_error: null,
    } )
  } )

  wakeWorker()

  return linking
}

// Every id must be a pending suggestion of this job; the first one that isn't is named
const assertPendingSuggestions = ( userId: string, jobId: string, ids: string[] ): void => {
  const found = new Map(
    findSuggestions( userId, jobId, ids ).map( ( stored ) => [ stored.id, stored ] ),
  )

  for( const suggestionId of ids ) {
    if( found.get( suggestionId )?.status !== 'pending' ) {
      throw new ConflictError( `Link suggestion ${ suggestionId } is not pending` )
    }
  }
}

export const acceptSuggestions = (
  userId: string,
  id: string,
  body: AcceptLinkSuggestionsBody,
): LinkSuggestionsResponse => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'ready_for_review' )

  assertPendingSuggestions( userId, id, body.ids )

  return inTransaction( () => {
    const updated = updateDraft( userId, id, { note_markdown: body.note_markdown } )

    setStatus( userId, body.ids, 'accepted', new Date().toISOString() )

    return { job: updated, suggestions: listSuggestions( userId, id ) }
  } )
}

export const rejectSuggestions = (
  userId: string,
  id: string,
  body: RejectLinkSuggestionsBody,
): LinkSuggestionsResponse => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'ready_for_review' )

  assertPendingSuggestions( userId, id, body.ids )
  setStatus( userId, body.ids, 'rejected', new Date().toISOString() )

  return { job: toPublicJob( userId, job ), suggestions: listSuggestions( userId, id ) }
}
