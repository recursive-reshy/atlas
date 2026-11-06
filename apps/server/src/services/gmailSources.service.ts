// Shared
import type {
  Backfill,
  CreateGmailSourceBody,
  GmailMatch,
  GmailSource,
  PreviewGmailSourceResponse,
  UpdateGmailSourceBody,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Gmail
import { GmailAuthError } from '../gmail/auth.js'
import {
  countMatches,
  getMessage,
  listLabels,
  listMatchingIds,
} from '../gmail/gmail.client.js'
import { parseMessage } from '../gmail/parseMessage.js'
import type { ParsedMessage } from '../gmail/parseMessage.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
import {
  countInbox,
  dismissInboxForSource,
  findStoredMessageIds,
  insertMessageIfNew,
} from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import {
  findSourceById,
  insertSource,
  listActiveSourcesByMatch,
  listSources as listStoredSources,
  markSourceDeleted,
  recordSourceFetch,
  updateSource as updateStoredSource,
} from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
import { countPostingsForSource } from '../repositories/postings.repository.js'
import { listDueGmailSources } from '../repositories/system.repository.js'
// Services
import { recordCheck } from './health.service.js'
import { queueNewsletterMessage } from './inbox.service.js'
import { assertActiveProfile } from './prompts.service.js'
import { getFeedCheckInterval } from './settings.service.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

const DAY_MS = 86_400_000
const MARGIN_DAYS = 2
const LIST_MAX = 100
const MAX_NEW_NEWSLETTERS_PER_CHECK = 10
const BACKFILL_MAX = 200
const BACKFILL_DAYS: Record< Backfill, number | null > = {
  none: 0,
  '30d': 30,
  '90d': 90,
  all: null,
}

type MessageStatus = StoredGmailMessage[ 'status' ]

export const requireConnectedGmail = ( userId: string ): void => {
  if( config.gmail === null ) {
    throw new ConflictError( 'Gmail isn\'t configured' )
  }

  const account = findAccount( userId )

  if( account === undefined ) {
    throw new ConflictError( 'Gmail isn\'t connected' )
  }

  if( account.status !== 'connected' ) {
    throw new ConflictError( 'Gmail needs to be reconnected' )
  }
}

const marginStart = ( syncFrom: Date ): Date => {
  return new Date( syncFrom.getTime() - MARGIN_DAYS * DAY_MS )
}

const toStoredMessage = (
  sourceId: string,
  parsed: ParsedMessage,
  status: MessageStatus,
  backfilled: boolean,
  addedAt: string,
): StoredGmailMessage => {
  return {
    id: crypto.randomUUID(),
    source_id: sourceId,
    message_id: parsed.messageId,
    subject: parsed.subject,
    sender: parsed.sender,
    sender_address: parsed.senderAddress,
    received_at: parsed.receivedAt,
    body_html: parsed.html,
    body_text: parsed.text,
    status,
    backfilled,
    attempts: 0,
    error: null,
    job_id: null,
    added_at: addedAt,
  }
}

// Emails run newest first. Each gets an added_at a millisecond earlier than the one before, so
// the inbox, which sorts on it, lists them newest first.
export const stampNewestFirst = (
  messages: { parsed: ParsedMessage, status: MessageStatus, backfilled: boolean }[],
  now: Date,
  sourceId: string,
): StoredGmailMessage[] => {
  return [ ...messages ]
    .sort( ( first, second ) => second.parsed.receivedAt.localeCompare( first.parsed.receivedAt ) )
    .map( ( { parsed, status, backfilled }, index ) => {
      const addedAt = new Date( now.getTime() - index ).toISOString()

      return toStoredMessage( sourceId, parsed, status, backfilled, addedAt )
    } )
}

const fetchParsed = async (
  userId: string,
  id: string,
  format: 'full' | 'metadata',
): Promise< ParsedMessage > => {
  return parseMessage( await getMessage( userId, id, format ) )
}

const newestOf = ( messages: ParsedMessage[] ): ParsedMessage | null => {
  return messages.reduce< ParsedMessage | null >( ( newest, message ) => {
    return newest === null || message.receivedAt > newest.receivedAt ? message : newest
  }, null )
}

const newestAmong = async (
  userId: string,
  heads: string[],
): Promise< ParsedMessage | null > => {
  const parsed: ParsedMessage[] = []

  for( const id of heads ) {
    parsed.push( await fetchParsed( userId, id, 'metadata' ) )
  }

  return newestOf( parsed )
}

const normalizeQuery = ( query: string ): string => query.trim().replace( /\s+/g, ' ' )

const sharesMatch = ( first: GmailMatch, second: GmailMatch ): boolean => {
  if( first.kind === 'query' && second.kind === 'query' ) {
    return normalizeQuery( first.query ) === normalizeQuery( second.query )
  }

  if( first.kind === 'labels' && second.kind === 'labels' ) {
    return first.label_ids.some( ( id ) => second.label_ids.includes( id ) )
  }

  return false
}

const findOverlaps = (
  userId: string,
  match: GmailMatch,
  excludeId?: string,
): PreviewGmailSourceResponse[ 'overlaps' ] => {
  return listActiveSourcesByMatch( userId )
    .filter( ( source ) => source.id !== excludeId && sharesMatch( match, source.match ) )
    .map( ( { id, name } ) => ( { id, name } ) )
}

// The names are a convenience: when Gmail can't give them, the list shows the ids instead.
const loadLabelNames = async (
  userId: string,
  sources: StoredGmailSource[],
): Promise< Map< string, string > > => {
  if( !sources.some( ( { match } ) => match.kind === 'labels' ) ) {
    return new Map()
  }

  try {
    return new Map( ( await listLabels( userId ) ).map( ( { id, name } ) => [ id, name ] ) )
  } catch{
    return new Map()
  }
}

const toPublicSource = (
  userId: string,
  source: StoredGmailSource,
  names: Map< string, string >,
): GmailSource => {
  return {
    id: source.id,
    name: source.name,
    match: source.match,
    label_names: source.match.kind === 'labels'
      ? source.match.label_ids.map( ( id ) => names.get( id ) ?? id )
      : [],
    destination: source.destination,
    profile_id: source.profile_id,
    auto_summarize: source.auto_summarize,
    enabled: source.enabled,
    sync_from: source.sync_from,
    last_checked_at: source.last_checked_at,
    last_error: source.last_error,
    last_skipped_count: source.last_skipped_count,
    inbox_count: countInbox( userId, source.id ),
    postings_count: countPostingsForSource( userId, source.id ),
    created_at: source.created_at,
  }
}

const presentSources = async (
  userId: string,
  sources: StoredGmailSource[],
): Promise< GmailSource[] > => {
  const names = await loadLabelNames( userId, sources )

  return sources.map( ( source ) => toPublicSource( userId, source, names ) )
}

const presentSource = async (
  userId: string,
  source: StoredGmailSource,
): Promise< GmailSource > => {
  const [ presented ] = await presentSources( userId, [ source ] )

  return presented
}

const requireActiveSource = ( userId: string, id: string ): StoredGmailSource => {
  const source = findSourceById( userId, id )

  if( source === undefined || source.deleted_at !== null ) {
    throw new NotFoundError( 'Gmail source not found' )
  }

  return source
}

export const listGmailSources = async ( userId: string ): Promise< GmailSource[] > => {
  return presentSources( userId, listStoredSources( userId ) )
}

// A lost connection reaches a route as a conflict, so the web app can say so.
const asConflict = async < T >( run: () => Promise< T > ): Promise< T > => {
  try {
    return await run()
  } catch( error ) {
    throw error instanceof GmailAuthError ? new ConflictError( error.message ) : error
  }
}

export const previewSource = async (
  userId: string,
  match: GmailMatch,
  excludeId?: string,
): Promise< PreviewGmailSourceResponse > => {
  requireConnectedGmail( userId )

  const { count, capped, heads } = await asConflict( () => countMatches( userId, match ) )
  const newest = await asConflict( () => newestAmong( userId, heads ) )

  return {
    count,
    count_capped: capped,
    newest: newest === null
      ? null
      : { subject: newest.subject, from: newest.sender, received_at: newest.receivedAt },
    overlaps: findOverlaps( userId, match, excludeId ),
  }
}

interface Collected {
  parsed: ParsedMessage
  status: MessageStatus
  backfilled: boolean
}

// What a new source starts with. Emails from the last two days are always accounted for, because
// every check looks that far back (ADR 0035): the ones that don't go to the inbox are stored as
// skipped, so the first check doesn't collect them.
const collectStarting = async (
  userId: string,
  body: CreateGmailSourceBody,
  now: Date,
): Promise< Collected[] > => {
  const collected: Collected[] = []
  const margin = async ( except: string | null ): Promise< void > => {
    const { ids } = await listMatchingIds(
      userId,
      body.match,
      { after: marginStart( now ), max: LIST_MAX },
    )

    for( const id of [ ...new Set( ids ) ].filter( ( found ) => found !== except ) ) {
      collected.push( {
        parsed: await fetchParsed( userId, id, 'metadata' ),
        status: 'skipped',
        backfilled: false,
      } )
    }
  }

  if( body.destination === 'jobs' ) {
    await margin( null )

    return collected
  }

  const days = BACKFILL_DAYS[ body.backfill ?? 'none' ]

  if( days === 0 ) {
    const { heads } = await listMatchingIds( userId, body.match, { max: 1 } )
    const newest = heads.length > 1 ? await newestAmong( userId, heads ) : null
    const newestId = newest?.messageId ?? heads[ 0 ] ?? null

    if( newestId !== null ) {
      collected.push( {
        parsed: await fetchParsed( userId, newestId, 'full' ),
        status: 'inbox',
        backfilled: false,
      } )
    }

    await margin( newestId )

    return collected
  }

  const after = days === null ? undefined : new Date( now.getTime() - days * DAY_MS )
  const { ids } = await listMatchingIds( userId, body.match, { after, max: BACKFILL_MAX } )

  for( const id of [ ...new Set( ids ) ].slice( 0, BACKFILL_MAX ) ) {
    collected.push( {
      parsed: await fetchParsed( userId, id, 'full' ),
      status: 'inbox',
      backfilled: true,
    } )
  }

  return collected
}

// The emails of an automatic newsletter source skip the inbox. One that can't be queued stays
// there instead. A backfill is never queued, so it costs nothing until it is picked from the inbox.
const queueAutomatically = async (
  userId: string,
  source: StoredGmailSource,
  rows: StoredGmailMessage[],
): Promise< void > => {
  if( source.destination !== 'newsletter' || !source.auto_summarize ) {
    return
  }

  const waiting = rows.filter( ( { status, backfilled } ) => status === 'inbox' && !backfilled )

  for( const row of waiting ) {
    try {
      await queueNewsletterMessage( userId, source, row )
    } catch( error ) {
      logger.error(
        { err: error, source_name: source.name, subject: row.subject },
        'Could not queue newsletter email',
      )
    }
  }
}

export const createSource = async (
  userId: string,
  body: CreateGmailSourceBody,
): Promise< GmailSource > => {
  // Job-alert intake is deferred (ADR 0041); stored jobs sources are still read.
  if( body.destination === 'jobs' ) {
    throw new ValidationError( 'Freelance jobs sources aren\'t available yet' )
  }

  requireConnectedGmail( userId )

  if( body.profile_id !== undefined ) {
    assertActiveProfile( userId, body.profile_id )
  }

  const now = new Date()
  const collected = await asConflict( () => collectStarting( userId, body, now ) )
  const source: StoredGmailSource = {
    id: crypto.randomUUID(),
    name: body.name,
    match: body.match,
    destination: body.destination,
    profile_id: body.profile_id ?? null,
    enabled: true,
    auto_summarize: body.auto_summarize ?? false,
    sync_from: now.toISOString(),
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: now.toISOString(),
    deleted_at: null,
  }

  const rows = stampNewestFirst( collected, now, source.id )

  inTransaction( () => {
    insertSource( userId, source )
    rows.forEach( ( row ) => insertMessageIfNew( userId, row ) )
  } )

  await queueAutomatically( userId, source, rows )

  return presentSource( userId, source )
}

export const updateSource = async (
  userId: string,
  id: string,
  body: UpdateGmailSourceBody,
): Promise< GmailSource > => {
  const source = requireActiveSource( userId, id )

  if( source.destination === 'jobs'
    && ( body.profile_id !== undefined || body.auto_summarize !== undefined ) ) {
    throw new ValidationError( 'Profile and Summarize automatically apply to newsletters only' )
  }

  if( typeof body.profile_id === 'string' ) {
    assertActiveProfile( userId, body.profile_id )
  }

  const changes: Partial< Omit< StoredGmailSource, 'id' > > = {}

  if( body.name !== undefined ) {
    changes.name = body.name
  }

  if( body.match !== undefined ) {
    changes.match = body.match
  }

  if( body.profile_id !== undefined ) {
    changes.profile_id = body.profile_id
  }

  if( body.enabled !== undefined ) {
    changes.enabled = body.enabled
  }

  if( body.auto_summarize !== undefined ) {
    changes.auto_summarize = body.auto_summarize
  }

  const updated = updateStoredSource( userId, id, changes )

  if( updated === undefined ) {
    throw new NotFoundError( 'Gmail source not found' )
  }

  return presentSource( userId, updated )
}

export const deleteSource = (
  userId: string,
  id: string,
  { removeInboxItems }: { removeInboxItems: boolean },
): void => {
  requireActiveSource( userId, id )

  inTransaction( () => {
    if( removeInboxItems ) {
      dismissInboxForSource( userId, id )
    }

    markSourceDeleted( userId, id, new Date().toISOString() )
  } )
}

const withoutBodies = ( parsed: ParsedMessage ): ParsedMessage => {
  return { ...parsed, html: null, text: null }
}

const readNewMessages = async (
  userId: string,
  source: StoredGmailSource,
): Promise< { messages: ParsedMessage[], missingLabelIds: string[], failure: string | null } > => {
  const messages: ParsedMessage[] = []
  let missingLabelIds: string[] = []

  try {
    const found = await listMatchingIds(
      userId,
      source.match,
      { after: marginStart( new Date( source.sync_from ) ), max: LIST_MAX },
    )
    const ids = [ ...new Set( found.ids ) ]
    const stored = findStoredMessageIds( userId, source.id, ids )

    missingLabelIds = found.missingLabelIds

    for( const id of ids.filter( ( found ) => !stored.has( found ) ) ) {
      messages.push( await fetchParsed( userId, id, 'full' ) )
    }

    return { messages, missingLabelIds, failure: null }
  } catch( error ) {
    // The account is no longer usable: end the pass, don't blame this source.
    if( error instanceof GmailAuthError ) {
      throw error
    }

    // What was read before the failure is kept; the rest is picked up by a later check.
    return {
      messages,
      missingLabelIds,
      failure: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Returns the rows this check added, for what follows a check (extraction, task 9.3).
const runCheck = async (
  userId: string,
  source: StoredGmailSource,
): Promise< StoredGmailMessage[] > => {
  const now = new Date()
  const { messages, missingLabelIds, failure } = await readNewMessages( userId, source )
  const newest = [ ...messages ]
    .sort( ( first, second ) => second.receivedAt.localeCompare( first.receivedAt ) )
  const collected: Collected[] = newest.map( ( parsed, index ) => {
    if( source.destination === 'jobs' ) {
      return { parsed, status: 'pending', backfilled: false }
    }

    return index < MAX_NEW_NEWSLETTERS_PER_CHECK
      ? { parsed, status: 'inbox', backfilled: false }
      : { parsed: withoutBodies( parsed ), status: 'skipped', backfilled: false }
  } )
  const overflow = collected.filter( ( { status } ) => status === 'skipped' ).length
  const added: StoredGmailMessage[] = []

  inTransaction( () => {
    stampNewestFirst( collected, now, source.id ).forEach( ( row ) => {
      if( insertMessageIfNew( userId, row ) ) {
        added.push( row )
      }
    } )

    recordSourceFetch( userId, source.id, {
      last_skipped_count: source.destination === 'newsletter' && messages.length > 0
        ? overflow
        : source.last_skipped_count,
    } )

    const problem = failure ?? ( missingLabelIds.length === 0
      ? null
      : `Label not found in Gmail: ${ missingLabelIds.join( ', ' ) }` )

    recordCheck(
      userId,
      { kind: 'gmail_source', id: source.id },
      problem === null ? { ok: true } : { ok: false, message: problem },
      now.toISOString(),
    )
  } )

  await queueAutomatically( userId, source, added )

  return added
}

export const checkSource = async ( userId: string, id: string ): Promise< GmailSource > => {
  const source = requireActiveSource( userId, id )

  if( !source.enabled ) {
    throw new ConflictError( 'This source is turned off' )
  }

  requireConnectedGmail( userId )
  await asConflict( () => runCheck( userId, source ) )

  return presentSource( userId, requireActiveSource( userId, id ) )
}

export const checkAllSources = async ( userId: string ): Promise< GmailSource[] > => {
  requireConnectedGmail( userId )

  for( const source of listStoredSources( userId ).filter( ( { enabled } ) => enabled ) ) {
    await asConflict( () => runCheck( userId, source ) )
  }

  return listGmailSources( userId )
}

// Serves every user: each due source is checked for its owner, and a user whose Gmail access
// has gone is skipped for the rest of the pass without holding the others back
export const checkDueSources = async (): Promise< number > => {
  if( config.gmail === null ) {
    return 0
  }

  const due = listDueGmailSources( new Date().toISOString(), getFeedCheckInterval() )
  const paused = new Set< string >()
  let checked = 0

  for( const { user_id: userId, ...source } of due ) {
    if( paused.has( userId ) ) {
      continue
    }

    try {
      await withLogContext(
        { gmail_source_id: source.id, user_id: userId },
        () => runCheck( userId, source ),
      )
      checked += 1
    } catch( error ) {
      if( error instanceof GmailAuthError ) {
        logger.warn(
          { user_id: userId },
          'Gmail sources paused: Google no longer accepts the stored access',
        )
        paused.add( userId )
        continue
      }

      logger.error(
        { err: error, gmail_source_id: source.id, source_name: source.name },
        'Gmail source check failed',
      )
    }
  }

  return checked
}
