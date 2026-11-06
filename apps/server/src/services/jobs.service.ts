// Shared
import {
  AcceptLinkSuggestionsBody,
  CreateJobBody,
  DownloadFormat,
  Job,
  JobStatus,
  LinkSuggestion,
  LinkSuggestionsResponse,
  LinkUsage,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  StoredLinkSuggestion,
  SummaryUsage,
  NoteParseError,
  ArticleSource,
  SourceDocument,
  SubmitPastedTextBody,
  UpdateDraftBody,
  VideoSource,
  applyLockedProperties,
  detectSourceType,
  lockedPropertiesFor,
  parseFolderPath,
  parseNote,
  serializeNote,
} from '@atlas/shared'
// Clients
import type { TokenUsage } from '../clients/claude.client.js'
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Formatters
import { transcriptFilename } from '../formatters/filename.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatNote } from '../formatters/note.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import {
  StoredJob,
  deleteJob,
  findJobById,
  insertJob,
  listActiveJobs,
  updateJob,
} from '../repositories/jobStore.repository.js'
import { insertLinkRun, summarizeLinkUsage } from '../repositories/linkRuns.repository.js'
import {
  findSuggestions,
  insertSuggestions,
  listSuggestions,
  setStatus,
  supersedePending,
} from '../repositories/linkSuggestions.repository.js'
import { findFeedById } from '../repositories/feeds.repository.js'
import { findSourceById } from '../repositories/gmailSources.repository.js'
import {
  findProfileById,
  findVersionById,
  setLastFolder,
} from '../repositories/promptProfiles.repository.js'
import { insertSummaryRun, listRunsForJob } from '../repositories/summaryRuns.repository.js'
import { insertTranscriptionRun } from '../repositories/transcriptionRuns.repository.js'
import {
  claimNextJob as claimNextStoredJob,
  listExpiredJobs,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
} from '../repositories/system.repository.js'
// Sources
import { articleFromText } from '../sources/text.js'
// Summarizer
import { estimateCostUsd, estimateTranscriptionCostUsd } from '../summarizer/pricing.js'
// Lifecycle
import { STATES, assertMove as assertTableMove } from '../jobs/lifecycle.js'
// Services
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile } from './prompts.service.js'
import { isLinkingEnabled } from './settings.service.js'
import { vaultRootFor } from './vault.service.js'
// Logging
import { logger } from '../logger.js'

export interface TranscriptionAttempt {
  model: string
  audio_seconds: number
  pieces: number
  outcome: 'ok' | 'error'
  error: string | null
}

export type StepStatus = 'fetching' | 'transcribing'

const transcriptFormats = {
  md: { contentType: 'text/markdown; charset=utf-8', formatter: formatMarkdown },
  txt: { contentType: 'text/plain; charset=utf-8', formatter: formatTxt },
} as const

type RenderedTranscript = {
  filename: string
  contentType: string
  body: string
}

const downloadableStatuses: JobStatus[] = [ 'ready_for_review', 'summary_failed' ]
const HOUR_MS = 3_600_000

const expiryFromNow = (): string => {
  return new Date( Date.now() + config.reviewTtlHours * HOUR_MS ).toISOString()
}

const toSummaryUsage = ( userId: string, jobId: string ): SummaryUsage | null => {
  const runs = listRunsForJob( userId, jobId )
  const last = runs.at( -1 )

  if( last === undefined ) {
    return null
  }

  const version = findVersionById( userId, last.prompt_version_id )
  const profile = version === undefined ? undefined : findProfileById( userId, version.profile_id )

  if( version === undefined || profile === undefined ) {
    throw new Error( `Summary run for job ${ jobId } points at a missing prompt version` )
  }

  const hasUnpricedTokens = runs.some(
    ( run ) => run.input_tokens !== null && run.cost_usd === null,
  )

  return {
    last_run: {
      model: last.model,
      profile_id: profile.id,
      profile_name: profile.name,
      prompt_version: version.version,
      input_tokens: last.input_tokens,
      output_tokens: last.output_tokens,
      cost_usd: last.cost_usd,
      outcome: last.outcome,
      created_at: last.created_at,
    },
    run_count: runs.length,
    total_input_tokens: runs.reduce( ( sum, run ) => sum + ( run.input_tokens ?? 0 ), 0 ),
    total_output_tokens: runs.reduce( ( sum, run ) => sum + ( run.output_tokens ?? 0 ), 0 ),
    total_cost_usd: hasUnpricedTokens
      ? null
      : runs.reduce( ( sum, run ) => sum + ( run.cost_usd ?? 0 ), 0 ),
  }
}

// The profile's last saved folder while it still exists in the vault (ADR 0059)
export const defaultFolderFor = (
  userId: string,
  job: { prompt_profile_id: string | null },
): string => {
  const lastFolder = job.prompt_profile_id === null
    ? null
    : findProfileById( userId, job.prompt_profile_id )?.last_folder ?? null

  if( lastFolder !== null && existingFolderSync( vaultRootFor( userId ), lastFolder ) ) {
    return lastFolder
  }

  return config.defaultNoteFolder
}

const toPublicJob = ( userId: string, job: StoredJob ): Job => {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
    title: job.title,
    note_markdown: job.note_markdown,
    target_folder: job.target_folder,
    default_folder: job.status === 'ready_for_review'
      ? defaultFolderFor( userId, job )
      : config.defaultNoteFolder,
    expires_at: job.expires_at,
    saved_path: job.saved_path,
    summary_model: job.summary_model,
    prompt_profile_id: job.prompt_profile_id,
    summary_usage: toSummaryUsage( userId, job.id ),
    link_state: job.link_state,
    link_error: job.link_error,
    link_usage: summarizeLinkUsage( userId, job.id ) ?? null,
    source_type: job.source_type,
    feed_id: job.feed_id,
    feed_name: job.feed_name,
    gmail_source_id: job.gmail_source_id,
    gmail_source_name: job.gmail_source_name,
  }
}

const toTranscript = (
  id: string,
  document: SourceDocument,
): Pick< VideoSource, 'meta' | 'text' > => {
  if( document.kind !== 'video' ) {
    throw new Error( `Job ${ id } is an article, not a video` )
  }

  return { meta: document.meta, text: document.text }
}

const requireJob = ( userId: string, id: string ): StoredJob => {
  const job = findJobById( userId, id )

  if( job === undefined ) {
    throw new NotFoundError( 'Job not found' )
  }

  return job
}

// A caller passes `expires_at` only for the autosave reset; otherwise the target state decides
const expiryFor = ( job: StoredJob, status: JobStatus ): string | null => {
  if( !STATES[ status ].expires ) {
    return null
  }

  return job.status === status ? job.expires_at : expiryFromNow()
}

// The table refuses; this logs the refusal, then lets the ConflictError through
const assertMove = ( job: StoredJob, to: JobStatus ): void => {
  try {
    assertTableMove( job, to )
  } catch( error ) {
    logger.warn( { from: job.status, to, source_type: job.source_type }, 'Job move refused' )
    throw error
  }
}

const moveTo = (
  userId: string,
  job: StoredJob,
  status: JobStatus,
  changes: Partial< StoredJob >,
): Job => {
  assertMove( job, status )

  const updated = updateJob( userId, job.id, {
    expires_at: expiryFor( job, status ),
    ...changes,
    status,
    updated_at: new Date().toISOString(),
  } )

  if( updated === undefined ) {
    throw new NotFoundError( 'Job not found' )
  }

  return toPublicJob( userId, updated )
}

const conflict = ( from: JobStatus, to: JobStatus ): ConflictError => {
  return new ConflictError( `Cannot move job from ${ from } to ${ to }` )
}

// The table says which moves exist; a function that makes one move also names the single
// status it starts from, because the same target can be reached from others
const assertFrom = ( job: StoredJob, from: JobStatus, to: JobStatus ): void => {
  if( job.status !== from ) {
    throw conflict( job.status, to )
  }

  assertMove( job, to )
}

type SummaryChoices = { model?: string | undefined, profile_id?: string | undefined }

const validateChoices = async (
  userId: string,
  { model, profile_id }: SummaryChoices,
): Promise< void > => {
  if( model !== undefined ) {
    await assertKnownModel( userId, model )
  }

  if( profile_id !== undefined ) {
    assertActiveProfile( userId, profile_id )
  }
}

export const queueJob = async (
  userId: string,
  body: CreateJobBody,
  extra: { feed_id?: string, gmail_source_id?: string, document?: ArticleSource } = {},
): Promise< Job > => {
  const { url, text, title } = body
  const sourceType = body.source_type ?? detectSourceType( url )

  await validateChoices( userId, body )

  if( ( text !== undefined || extra.document !== undefined ) && sourceType !== 'article' ) {
    throw new ValidationError( 'Pasted text is only for articles' )
  }

  const document = extra.document ?? ( text === undefined
    ? null
    : articleFromText( { url, text, title, origin: 'pasted' } ) )
  const gmailSource = extra.gmail_source_id === undefined
    ? undefined
    : findSourceById( userId, extra.gmail_source_id )

  if( extra.gmail_source_id !== undefined && gmailSource === undefined ) {
    throw new ValidationError( 'Unknown Gmail source' )
  }

  const now = new Date().toISOString()
  const job: StoredJob = {
    id: crypto.randomUUID(),
    url,
    status: document === null ? 'queued' : 'summarizing',
    error: null,
    created_at: now,
    updated_at: now,
    title: document?.meta.title ?? null,
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
    summary_model: body.model ?? null,
    prompt_profile_id: body.profile_id ?? null,
    link_state: null,
    link_error: null,
    source_document: document,
    source_type: sourceType,
    feed_id: extra.feed_id ?? null,
    feed_name: extra.feed_id === undefined
      ? null
      : findFeedById( userId, extra.feed_id )?.name ?? null,
    gmail_source_id: extra.gmail_source_id ?? null,
    gmail_source_name: gmailSource?.name ?? null,
  }

  insertJob( userId, job )

  return toPublicJob( userId, job )
}

export const findJob = ( userId: string, id: string ): Job => {
  return toPublicJob( userId, requireJob( userId, id ) )
}

export const listJobs = ( userId: string ): Job[] => {
  return listActiveJobs( userId ).map( ( job ) => toPublicJob( userId, job ) )
}

// The worker serves every user in turn (ADR 0064): the next job comes with whose it is
export const claimNextJob = (): { job: Job, userId: string } | undefined => {
  const next = claimNextStoredJob( new Date().toISOString() )

  if( next === undefined ) {
    return undefined
  }

  const { user_id: userId, ...stored } = next

  return { job: toPublicJob( userId, stored ), userId }
}

export const markStatus = ( userId: string, id: string, status: StepStatus ): Job => {
  return moveTo( userId, requireJob( userId, id ), status, {} )
}

export const completeAcquisition = (
  userId: string,
  id: string,
  document: SourceDocument,
): Job => {
  const job = requireJob( userId, id )

  const expected = document.kind === 'video' ? 'transcribing' : 'fetching'

  if( job.status !== expected || job.source_type !== document.kind ) {
    throw conflict( job.status, 'summarizing' )
  }

  return moveTo( userId, job, 'summarizing', {
    source_document: document,
    title: document.meta.title,
  } )
}

export const completeSummary = (
  userId: string,
  id: string,
  summaryMarkdown: string,
  suggestedTags: string[],
): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'summarizing', 'ready_for_review' )

  const document = getSource( userId, id )

  const linking = config.agent !== null && isLinkingEnabled( userId )

  return moveTo( userId, job, linking ? 'linking' : 'ready_for_review', {
    note_markdown: formatNote( {
      title: job.title ?? document.meta.title,
      tags: suggestedTags,
      body: summaryMarkdown,
      document,
      created: new Date().toISOString().slice( 0, 10 ),
    } ),
    error: null,
    link_state: linking ? 'pending' : 'off',
    link_error: null,
  } )
}

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

export const recordSummaryRun = (
  userId: string,
  jobId: string,
  run: {
    model: string
    promptVersionId: number
    usage: TokenUsage | undefined
    error?: string
  },
): void => {
  const inputTokens = run.usage?.input_tokens ?? null
  const outputTokens = run.usage?.output_tokens ?? null

  insertSummaryRun( userId, {
    job_id: jobId,
    model: run.model,
    prompt_version_id: run.promptVersionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd( run.model, inputTokens, outputTokens ),
    outcome: run.error === undefined ? 'succeeded' : 'failed',
    error: run.error ?? null,
    created_at: new Date().toISOString(),
  } )
}

export const recordTranscriptionRun = (
  userId: string,
  jobId: string,
  attempt: TranscriptionAttempt,
): void => {
  insertTranscriptionRun( userId, {
    job_id: jobId,
    ...attempt,
    cost_usd: estimateTranscriptionCostUsd( attempt.model, attempt.audio_seconds ),
    created_at: new Date().toISOString(),
  } )
}

export const failSummary = ( userId: string, id: string, message: string ): Job => {
  const job = requireJob( userId, id )

  return moveTo( userId, job, 'summary_failed', { error: message } )
}

export const retrySummary = ( userId: string, id: string ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'summary_failed', 'summarizing' )

  return moveTo( userId, job, 'summarizing', { error: null } )
}

export const regenerateSummary = async (
  userId: string,
  id: string,
  choices: SummaryChoices,
): Promise< Job > => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'summarizing' )

  await validateChoices( userId, choices )

  supersedePending( userId, id )

  return moveTo( userId, job, 'summarizing', {
    summary_model: choices.model ?? job.summary_model,
    prompt_profile_id: choices.profile_id ?? job.prompt_profile_id,
    error: null,
    link_state: null,
    link_error: null,
  } )
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

  return inTransaction( () => {
    if( body.note_markdown !== undefined ) {
      updateDraft( userId, id, { note_markdown: body.note_markdown } )
    }

    supersedePending( userId, id )

    return moveTo( userId, requireJob( userId, id ), 'linking', {
      link_state: 'pending',
      link_error: null,
    } )
  } )
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

export const discardJob = ( userId: string, id: string ): void => {
  const job = requireJob( userId, id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( `Cannot discard a job that is ${ job.status }` )
  }

  deleteJob( userId, id )
}

export const deleteExpiredJobs = (): number => {
  const expired = listExpiredJobs( new Date().toISOString() )

  for( const { id, user_id: userId } of expired ) {
    deleteJob( userId, id )
  }

  return expired.length
}

export const getSource = ( userId: string, id: string ): SourceDocument => {
  const job = requireJob( userId, id )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } has no transcript` )
  }

  return job.source_document
}

export const submitPastedText = (
  userId: string,
  id: string,
  { text, title }: SubmitPastedTextBody,
): Job => {
  const job = requireJob( userId, id )

  if( job.source_type !== 'article' || job.status !== 'failed' ) {
    throw new ConflictError( 'Pasted text can only continue a failed article job' )
  }

  const document = articleFromText( { url: job.url, text, title, origin: 'pasted' } )

  return moveTo( userId, job, 'summarizing', {
    source_document: document,
    title: document.meta.title,
    error: null,
  } )
}

export const failJob = ( userId: string, id: string, message: string ): Job => {
  const job = requireJob( userId, id )

  return moveTo( userId, job, 'failed', { error: message } )
}

export const recoverInterruptedJobs = (): number => {
  const message = 'Interrupted by restart'
  const now = new Date().toISOString()

  return markInterruptedJobs( message, now )
    + markInterruptedLinkingJobs( message, now, expiryFromNow() )
}

export const findSource = ( userId: string, id: string ): SourceDocument => {
  const job = requireJob( userId, id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( 'Transcript not ready' )
  }

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  return job.source_document
}

const today = (): string => new Date().toISOString().slice( 0, 10 )

export const updateDraft = ( userId: string, id: string, body: UpdateDraftBody ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'ready_for_review' )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  const changes: Partial< StoredJob > = { expires_at: expiryFromNow() }

  if( body.note_markdown !== undefined ) {
    let created = today()

    try {
      if( job.note_markdown !== null ) {
        created = parseNote( job.note_markdown ).properties.created
      }

      const note = applyLockedProperties(
        parseNote( body.note_markdown ),
        lockedPropertiesFor( job.source_document, created ),
      )

      changes.note_markdown = serializeNote( note )
      changes.title = note.properties.title
    } catch( error ) {
      if( !( error instanceof NoteParseError ) ) {
        throw error
      }

      throw new ValidationError( `front-matter invalid: ${ error.message }` )
    }
  }

  if( body.target_folder !== undefined ) {
    if( body.target_folder !== null ) {
      try {
        parseFolderPath( body.target_folder )
      } catch( error ) {
        throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
      }
    }

    changes.target_folder = body.target_folder
  }

  return moveTo( userId, job, job.status, changes )
}

export const saveJob = async ( userId: string, id: string ): Promise< string > => {
  const job = requireJob( userId, id )

  assertMove( job, 'saved' )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  if( job.note_markdown === null ) {
    throw new ConflictError( 'The job has no draft to save' )
  }

  const note = applyLockedProperties(
    parseNote( job.note_markdown ),
    lockedPropertiesFor( job.source_document, today() ),
  )

  const folder = job.target_folder ?? defaultFolderFor( userId, job )

  const savedPath = await writeNote(
    vaultRootFor( userId ),
    folder,
    note.properties.title,
    serializeNote( note ),
  )

  if( job.prompt_profile_id !== null ) {
    setLastFolder( userId, job.prompt_profile_id, folder )
  }

  moveTo( userId, job, 'saved', {
    saved_path: savedPath,
    title: note.properties.title,
    source_document: null,
  } )

  return savedPath
}

export const renderTranscript = (
  userId: string,
  id: string,
  format: DownloadFormat,
): RenderedTranscript => {
  const document = findSource( userId, id )

  if( document.kind === 'article' ) {
    if( format !== 'md' ) {
      throw new ConflictError( 'Only Markdown is available for articles' )
    }

    return {
      filename: transcriptFilename( document.meta.title, format ),
      contentType: transcriptFormats.md.contentType,
      body: `# ${ document.meta.title }\n\n${ document.meta.source }\n\n${ document.markdown }`,
    }
  }

  const transcript = toTranscript( id, document )
  const { contentType, formatter } = transcriptFormats[ format ]

  return {
    filename: transcriptFilename( transcript.meta.title, format ),
    contentType,
    body: formatter( transcript ),
  }
}
