// Packages
import { z } from 'zod'
// Shared
import { Job, SourceDocument } from '@atlas/shared'

// Row mapping shared by the job store and the system repository; not a repository itself

export const StoredJob = Job.omit( {
  summary_usage: true,
  link_usage: true,
  default_folder: true,
} ).extend( {
  source_document: SourceDocument.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

// A job with its owner, for the background loops that look across users
export type OwnedJob = StoredJob & { user_id: string }

const JobRow = z.object( {
  id: z.string(),
  user_id: z.string(),
  url: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  title: z.string().nullable(),
  source_document: z.string().nullable(),
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
  summary_model: z.string().nullable(),
  prompt_profile_id: z.string().nullable(),
  link_state: z.string().nullable(),
  link_error: z.string().nullable(),
  source_type: z.string(),
  feed_id: z.string().nullable(),
  feed_name: z.string().nullable(),
  gmail_source_id: z.string().nullable(),
  gmail_source_name: z.string().nullable(),
  saved_path: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )

export const SELECT_JOB = `SELECT jobs.*, feeds.name AS feed_name,
    gmail_sources.name AS gmail_source_name
  FROM jobs
    LEFT JOIN feeds ON feeds.id = jobs.feed_id
    LEFT JOIN gmail_sources ON gmail_sources.id = jobs.gmail_source_id`

// Statuses are bound parameters, never concatenated into the SQL
export const marks = ( statuses: string[] ): string => statuses.map( () => '?' ).join( ', ' )

export const toStoredJob = ( raw: unknown ): StoredJob => {
  const row = JobRow.parse( raw )

  // The schema drops user_id: a StoredJob has no owner field
  return StoredJob.parse( {
    ...row,
    source_document: row.source_document === null
      ? null
      : JSON.parse( row.source_document ) as unknown,
  } )
}

export const toOwnedJob = ( raw: unknown ): OwnedJob => {
  return { ...toStoredJob( raw ), user_id: JobRow.parse( raw ).user_id }
}

// A video's length is kept on the job after its transcript is deleted (ADR 0069); an update
// without a transcript passes null, which `COALESCE` in the update leaves alone
export const toRow = ( job: StoredJob ): Record< string, string | number | null > => {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    title: job.title,
    source_document: job.source_document === null ? null : JSON.stringify( job.source_document ),
    note_markdown: job.note_markdown,
    target_folder: job.target_folder,
    summary_model: job.summary_model,
    prompt_profile_id: job.prompt_profile_id,
    link_state: job.link_state,
    link_error: job.link_error,
    source_type: job.source_type,
    feed_id: job.feed_id,
    gmail_source_id: job.gmail_source_id,
    saved_path: job.saved_path,
    expires_at: job.expires_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
    duration_seconds: job.source_document?.kind === 'video'
      ? job.source_document.meta.duration_seconds
      : null,
  }
}
