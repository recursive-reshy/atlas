// Shared
import {
  CreateJobBody,
  Job,
  JobStatus,
  LinkUsageSummary,
  SummaryUsage,
  ArticleSource,
  SourceDocument,
  detectSourceType,
  videoRefusal,
} from '@atlas/shared'
// Clients
import type { TokenUsage } from '../clients/claude.client.js'
import { existingFolderSync } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
// Repositories
import {
  StoredJob,
  deleteJob,
  findJobById,
  insertJob,
  listActiveJobs,
  updateJob,
} from '../repositories/jobStore.repository.js'
import { summarizeLinkUsageForJobs } from '../repositories/linkRuns.repository.js'
import { supersedePending } from '../repositories/linkSuggestions.repository.js'
import { findFeedById } from '../repositories/feeds.repository.js'
import { findSourceById } from '../repositories/gmailSources.repository.js'
import {
  findProfileById,
  findVersionById,
} from '../repositories/promptProfiles.repository.js'
import {
  insertSummaryRun,
  listRunsForJobs,
  type StoredSummaryRun,
} from '../repositories/summaryRuns.repository.js'
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
import { estimateCostUsd, estimateGeminiCostUsd } from '../summarizer/pricing.js'
// Lifecycle
import { STATES, assertMove as assertTableMove } from '../jobs/lifecycle.js'
// Services
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile } from './prompts.service.js'
import { isLinkingEnabled } from './settings.service.js'
import { vaultRootFor } from './vault.service.js'
// Worker
import { wakeWorker } from '../worker/wake.js'
// Logging
import { logger } from '../logger.js'

export interface TranscriptionAttempt {
  model: string
  duration_seconds: number
  input_tokens: number | null
  output_tokens: number | null
  outcome: 'ok' | 'error'
  error: string | null
}

export type StepStatus = 'fetching' | 'transcribing'



export const downloadableStatuses: JobStatus[] = [ 'ready_for_review', 'summary_failed' ]
const HOUR_MS = 3_600_000

export const expiryFromNow = (): string => {
  return new Date( Date.now() + config.reviewTtlHours * HOUR_MS ).toISOString()
}

// What a public job needs beyond its row, fetched once for the jobs being mapped together: the
// runs by one query each, and each profile, version and folder looked up once however many jobs
// share it
type Lookups = {
  summaryRuns: ( jobId: string ) => StoredSummaryRun[]
  linkUsage: ( jobId: string ) => LinkUsageSummary | undefined
  profile: ( profileId: string ) => ReturnType< typeof findProfileById >
  version: ( versionId: number ) => ReturnType< typeof findVersionById >
  folder: ( profileId: string | null ) => string
}

const memoize = < Key, Value >( compute: ( key: Key ) => Value ): ( ( key: Key ) => Value ) => {
  const cache = new Map< Key, { value: Value } >()

  return ( key ) => {
    const hit = cache.get( key ) ?? { value: compute( key ) }

    cache.set( key, hit )

    return hit.value
  }
}

const lookupsFor = ( userId: string, jobIds: string[] ): Lookups => {
  const runs = listRunsForJobs( userId, jobIds )
  const links = summarizeLinkUsageForJobs( userId, jobIds )
  const profile = memoize( ( profileId: string ) => findProfileById( userId, profileId ) )

  return {
    summaryRuns: ( jobId ) => runs.get( jobId ) ?? [],
    linkUsage: ( jobId ) => links.get( jobId ),
    profile,
    version: memoize( ( versionId: number ) => findVersionById( userId, versionId ) ),
    folder: memoize( ( profileId: string | null ) => folderFor( userId, profileId, profile ) ),
  }
}

const toSummaryUsage = (
  jobId: string,
  { summaryRuns, profile, version: findVersion }: Lookups,
): SummaryUsage | null => {
  const runs = summaryRuns( jobId )
  const last = runs.at( -1 )

  if( last === undefined ) {
    return null
  }

  const version = findVersion( last.prompt_version_id )
  const owner = version === undefined ? undefined : profile( version.profile_id )

  if( version === undefined || owner === undefined ) {
    throw new Error( `Summary run for job ${ jobId } points at a missing prompt version` )
  }

  const hasUnpricedTokens = runs.some(
    ( run ) => run.input_tokens !== null && run.cost_usd === null,
  )

  return {
    last_run: {
      model: last.model,
      profile_id: owner.id,
      profile_name: owner.name,
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
const folderFor = (
  userId: string,
  profileId: string | null,
  profile: Lookups[ 'profile' ],
): string => {
  const lastFolder = profileId === null ? null : profile( profileId )?.last_folder ?? null

  if( lastFolder !== null && existingFolderSync( vaultRootFor( userId ), lastFolder ) ) {
    return lastFolder
  }

  return config.defaultNoteFolder
}

export const defaultFolderFor = (
  userId: string,
  job: { prompt_profile_id: string | null },
): string => {
  return folderFor( userId, job.prompt_profile_id, ( id ) => findProfileById( userId, id ) )
}

export const toPublicJob = (
  userId: string,
  job: StoredJob,
  lookups: Lookups = lookupsFor( userId, [ job.id ] ),
): Job => {
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
      ? lookups.folder( job.prompt_profile_id )
      : config.defaultNoteFolder,
    expires_at: job.expires_at,
    saved_path: job.saved_path,
    summary_model: job.summary_model,
    prompt_profile_id: job.prompt_profile_id,
    summary_usage: toSummaryUsage( job.id, lookups ),
    link_state: job.link_state,
    link_error: job.link_error,
    link_usage: lookups.linkUsage( job.id ) ?? null,
    source_type: job.source_type,
    feed_id: job.feed_id,
    feed_name: job.feed_name,
    gmail_source_id: job.gmail_source_id,
    gmail_source_name: job.gmail_source_name,
  }
}

export const requireJob = ( userId: string, id: string ): StoredJob => {
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
export const assertMove = ( job: StoredJob, to: JobStatus ): void => {
  try {
    assertTableMove( job, to )
  } catch( error ) {
    logger.warn( { from: job.status, to, source_type: job.source_type }, 'Job move refused' )
    throw error
  }
}

export const moveTo = (
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
export const assertFrom = ( job: StoredJob, from: JobStatus, to: JobStatus ): void => {
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

  // Text already in hand (pasted, a feed's full text, an email) is an article whatever the site
  const refusal = text === undefined && extra.document === undefined ? videoRefusal( body ) : null

  if( refusal !== null ) {
    throw new ValidationError( refusal )
  }

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
  wakeWorker()

  return toPublicJob( userId, job )
}

export const findJob = ( userId: string, id: string ): Job => {
  return toPublicJob( userId, requireJob( userId, id ) )
}

export const listJobs = ( userId: string ): Job[] => {
  const jobs = listActiveJobs( userId )
  const lookups = lookupsFor( userId, jobs.map( ( { id } ) => id ) )

  return jobs.map( ( job ) => toPublicJob( userId, job, lookups ) )
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

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } has no transcript` )
  }

  const document = job.source_document

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
    cost_usd: estimateGeminiCostUsd( attempt.model, attempt.input_tokens, attempt.output_tokens ),
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

  const retried = moveTo( userId, job, 'summarizing', { error: null } )

  wakeWorker()

  return retried
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

  const regenerated = moveTo( userId, job, 'summarizing', {
    summary_model: choices.model ?? job.summary_model,
    prompt_profile_id: choices.profile_id ?? job.prompt_profile_id,
    error: null,
    link_state: null,
    link_error: null,
  } )

  wakeWorker()

  return regenerated
}







export const deleteExpiredJobs = (): number => {
  const expired = listExpiredJobs( new Date().toISOString() )

  for( const { id, user_id: userId } of expired ) {
    deleteJob( userId, id )
  }

  return expired.length
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





