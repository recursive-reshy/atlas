// Repositories
import { saveAccount } from '../repositories/gmailAccount.repository.js'
import { insertSource } from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
import { seedCheck } from './health.fixture.js'

export const DAY_MS = 86_400_000

export interface Matching {
  ids: string[]
  heads: string[]
  missingLabelIds: string[]
}

// What the Gmail client returns for a listing: the ids, the first as the head.
export const idsOf = ( ...ids: string[] ): Matching => {
  return { ids, heads: ids.slice( 0, 1 ), missingLabelIds: [] }
}

export const connectGmail = ( userId: string ): void => {
  saveAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const buildStoredSource = (
  overrides: Partial< StoredGmailSource > = {},
): StoredGmailSource => {
  return {
    id: crypto.randomUUID(),
    name: 'Source',
    match: { kind: 'query', query: 'from:donotreply@upwork.com' },
    destination: 'jobs',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: '2026-10-17T12:00:00.000Z',
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-17T12:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

export const addStoredSource = (
  userId: string,
  overrides: Partial< StoredGmailSource > = {},
): StoredGmailSource => {
  const source = buildStoredSource( overrides )

  insertSource( userId, source )
  seedCheck( userId, 'gmail_source', source.id, source.last_checked_at, source.last_error )

  return source
}
