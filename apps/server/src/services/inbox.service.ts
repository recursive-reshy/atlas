// Shared
import { ARTICLE_LIMITS, detectSourceType } from '@atlas/shared'
import type {
  InboxItem,
  InboxItemRef,
  Job,
  SummarizeInboxBody,
  SummarizeInboxResponse,
} from '@atlas/shared'
// Errors
import { ConflictError, UnprocessableError, ValidationError } from '../errors.js'
// Gmail
import { gmailLink } from '../gmail/links.js'
// Repositories
import {
  findItemsByIds,
  listInbox as listFeedInbox,
  setItemStatus,
} from '../repositories/feedItems.repository.js'
import type { StoredFeedItem } from '../repositories/feedItems.repository.js'
import { findFeedById } from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
import {
  findMessagesByIds,
  listNewsletterInbox,
  setMessageStatus,
} from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import { findSourceById } from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
// Sources
import { emailToMarkdown } from '../sources/emailToMarkdown.js'
import { articleFromText } from '../sources/text.js'
// Services
import { queueJob } from './jobs.service.js'
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile } from './prompts.service.js'

interface Choices {
  model?: string | undefined
  profile_id?: string | undefined
}

// A feed's or source's profile may have been deleted since it was chosen; the default takes
// over then.
const remembered = ( userId: string, profileId: string | null ): string | undefined => {
  if( profileId === null ) {
    return undefined
  }

  try {
    assertActiveProfile( userId, profileId )

    return profileId
  } catch( error ) {
    if( error instanceof ValidationError ) {
      return undefined
    }

    throw error
  }
}

export const queueFeedItem = async (
  userId: string,
  feed: StoredFeed,
  item: StoredFeedItem,
  choices: Choices = {},
): Promise< Job > => {
  const profile = choices.profile_id ?? remembered( userId, feed.profile_id )
  const body = {
    url: item.link,
    ...choices.model === undefined ? {} : { model: choices.model },
    ...profile === undefined ? {} : { profile_id: profile },
  }
  const isFullText = item.content_markdown !== null && detectSourceType( item.link ) === 'article'
  const document = isFullText
    ? articleFromText( {
      url: item.link,
      text: item.content_markdown ?? '',
      title: item.title,
      origin: 'feed',
      author: item.author,
      site: feed.name,
      published: item.published_at?.slice( 0, 10 ) ?? null,
    } )
    : undefined

  const extra = { feed_id: feed.id, ...document === undefined ? {} : { document } }
  const job = await queueJob( userId, body, extra )

  setItemStatus( userId, [ item.id ], 'queued', job.id )

  return job
}

export const queueNewsletterMessage = async (
  userId: string,
  source: StoredGmailSource,
  row: StoredGmailMessage,
  choices: Choices = {},
): Promise< Job > => {
  const markdown = emailToMarkdown( { html: row.body_html, text: row.body_text } )

  if( markdown.length < ARTICLE_LIMITS.minPastedChars ) {
    throw new ValidationError( 'This email has too little text to summarize' )
  }

  if( markdown.length > ARTICLE_LIMITS.maxChars ) {
    throw new ValidationError( 'This email is too long to summarize' )
  }

  const email = findAccount( userId )?.email ?? null
  const link = gmailLink( { email, messageId: row.message_id } )
  const profile = choices.profile_id ?? remembered( userId, source.profile_id )
  const body = {
    url: link,
    ...choices.model === undefined ? {} : { model: choices.model },
    ...profile === undefined ? {} : { profile_id: profile },
  }
  const document = articleFromText( {
    url: link,
    text: markdown,
    title: row.subject,
    origin: 'email',
    author: row.sender,
    site: source.name,
    published: row.received_at.slice( 0, 10 ),
  } )
  const job = await queueJob( userId, body, { gmail_source_id: source.id, document } )

  setMessageStatus( userId, [ row.id ], 'queued', job.id )

  return job
}

export const listInbox = ( userId: string ): InboxItem[] => {
  const email = findAccount( userId )?.email ?? null
  const feedItems = listFeedInbox( userId ).map( ( item ): InboxItem => ( {
    kind: 'feed',
    id: item.id,
    feed_id: item.feed_id,
    feed_name: item.feed_name,
    title: item.title,
    link: item.link,
    published_at: item.published_at,
    source_type: detectSourceType( item.link ),
    added_at: item.added_at,
  } ) )
  const emails = listNewsletterInbox( userId ).map( ( row ): InboxItem => ( {
    kind: 'gmail',
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    title: row.subject,
    sender: row.sender,
    link: gmailLink( { email, messageId: row.message_id } ),
    published_at: row.received_at,
    source_type: 'article',
    added_at: row.added_at,
  } ) )

  return [ ...feedItems, ...emails ].sort( ( first, second ) => {
    return second.added_at.localeCompare( first.added_at )
  } )
}

type Queued =
  | { kind: 'feed', item: StoredFeedItem }
  | { kind: 'gmail', row: StoredGmailMessage }

const titleOf = ( queued: Queued ): string => {
  return queued.kind === 'feed' ? queued.item.title : queued.row.subject
}

const failureText = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const queueOne = async (
  userId: string,
  queued: Queued,
  choices: Choices,
): Promise< Job > => {
  if( queued.kind === 'feed' ) {
    const feed = findFeedById( userId, queued.item.feed_id )

    if( feed === undefined ) {
      throw new ConflictError( 'Feed not found' )
    }

    return queueFeedItem( userId, feed, queued.item, choices )
  }

  const source = findSourceById( userId, queued.row.source_id )

  if( source === undefined ) {
    throw new ConflictError( 'Gmail source not found' )
  }

  return queueNewsletterMessage( userId, source, queued.row, choices )
}

const unique = ( refs: InboxItemRef[] ): InboxItemRef[] => {
  const seen = new Set< string >()

  return refs.filter( ( { kind, id } ) => {
    const key = `${ kind }:${ id }`

    return seen.has( key ) ? false : Boolean( seen.add( key ) )
  } )
}

// What is in the inbox among the refs, by ref, so that a feed ref never reads an email.
const findInInbox = ( userId: string, refs: InboxItemRef[] ): Map< string, Queued > => {
  const ids = ( kind: InboxItemRef[ 'kind' ] ): string[] => {
    return refs.filter( ( ref ) => ref.kind === kind ).map( ( { id } ) => id )
  }
  const found = new Map< string, Queued >()

  for( const item of findItemsByIds( userId, ids( 'feed' ) ) ) {
    if( item.status === 'inbox' ) {
      found.set( `feed:${ item.id }`, { kind: 'feed', item } )
    }
  }

  for( const row of findMessagesByIds( userId, ids( 'gmail' ) ) ) {
    if( row.status === 'inbox' ) {
      found.set( `gmail:${ row.id }`, { kind: 'gmail', row } )
    }
  }

  return found
}

export const summarizeItems = async (
  userId: string,
  { items, model, profile_id }: SummarizeInboxBody,
): Promise< SummarizeInboxResponse > => {
  const refs = unique( items )
  const inbox = findInInbox( userId, refs )
  const bad = refs.filter( ( { kind, id } ) => !inbox.has( `${ kind }:${ id }` ) )

  if( bad.length > 0 ) {
    throw new ConflictError( `Not in the inbox: ${ bad.map( ( { id } ) => id ).join( ', ' ) }` )
  }

  if( model !== undefined ) {
    await assertKnownModel( userId, model )
  }

  if( profile_id !== undefined ) {
    assertActiveProfile( userId, profile_id )
  }

  const jobs: Job[] = []
  const failures: string[] = []

  // One item failing doesn't hold back the rest; it stays in the inbox.
  for( const { kind, id } of refs ) {
    const queued = inbox.get( `${ kind }:${ id }` )

    if( queued !== undefined ) {
      try {
        jobs.push( await queueOne( userId, queued, { model, profile_id } ) )
      } catch( error ) {
        failures.push( `"${ titleOf( queued ) }" (${ failureText( error ) })` )
      }
    }
  }

  if( jobs.length === 0 && failures.length > 0 ) {
    throw new UnprocessableError( `Could not summarize ${ failures.join( ', ' ) }` )
  }

  return { jobs }
}

export const dismissItems = ( userId: string, items: InboxItemRef[] ): void => {
  const inbox = [ ...findInInbox( userId, unique( items ) ).values() ]

  setItemStatus(
    userId,
    inbox.flatMap( ( queued ) => queued.kind === 'feed' ? [ queued.item.id ] : [] ),
    'dismissed',
  )
  setMessageStatus(
    userId,
    inbox.flatMap( ( queued ) => queued.kind === 'gmail' ? [ queued.row.id ] : [] ),
    'dismissed',
  )
}
