// Packages
import { z } from 'zod'
// Shared
import { GmailDestination, GmailMatch } from '@atlas/shared'

// Row mapping shared by the Gmail sources repository and the system repository; not a repository

export const StoredGmailSource = z.object( {
  id: z.string(),
  name: z.string(),
  match: GmailMatch,
  destination: GmailDestination,
  profile_id: z.string().nullable(),
  enabled: z.boolean(),
  auto_summarize: z.boolean(),
  sync_from: z.string(),
  last_checked_at: z.string().nullable(),
  last_error: z.string().nullable(),
  last_skipped_count: z.number().int(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
} )
export type StoredGmailSource = z.infer< typeof StoredGmailSource >

export type SourceFetch = Pick< StoredGmailSource, 'last_skipped_count' >

// last_checked_at and last_error belong to health_status (ADR 0050); reads get them by a join.
export const SELECT_SOURCE = `SELECT gmail_sources.*, h.last_checked_at, h.last_error
  FROM gmail_sources
  LEFT JOIN health_status h ON h.kind = 'gmail_source' AND h.subject_id = gmail_sources.id`

const SourceRow = z.object( {
  match_kind: z.enum( [ 'labels', 'query' ] ),
  label_ids: z.string().nullable(),
  query: z.string().nullable(),
  enabled: z.number(),
  auto_summarize: z.number(),
} ).loose()

export const toStoredSource = ( raw: unknown ): StoredGmailSource => {
  const {
    match_kind: kind,
    label_ids: labelIds,
    query,
    ...row
  } = SourceRow.parse( raw )

  return StoredGmailSource.parse( {
    ...row,
    match: kind === 'labels'
      ? { kind, label_ids: JSON.parse( labelIds ?? '[]' ) as unknown }
      : { kind, query },
    enabled: row.enabled === 1,
    auto_summarize: row.auto_summarize === 1,
  } )
}

export const toRow = ( source: StoredGmailSource ): Record< string, string | number | null > => {
  const { match, ...rest } = source

  return {
    ...rest,
    match_kind: match.kind,
    label_ids: match.kind === 'labels' ? JSON.stringify( match.label_ids ) : null,
    query: match.kind === 'query' ? match.query : null,
    enabled: source.enabled ? 1 : 0,
    auto_summarize: source.auto_summarize ? 1 : 0,
  }
}

// A source with its owner, for the poller that serves every user
export type OwnedGmailSource = StoredGmailSource & { user_id: string }

export const toOwnedSource = ( raw: unknown ): OwnedGmailSource => {
  const { user_id } = z.object( { user_id: z.string() } ).loose().parse( raw )

  return { ...toStoredSource( raw ), user_id }
}
