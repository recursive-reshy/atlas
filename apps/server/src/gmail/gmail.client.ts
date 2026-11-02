// Packages
import type { gmail_v1 } from '@googleapis/gmail'
// Shared
import type { GmailLabel, GmailMatch } from '@atlas/shared'
// Gmail
import { withGmail } from './auth.js'

type ListPage = { data: gmail_v1.Schema$ListMessagesResponse }

const PAGE_SIZE_LIMIT = 500
const COUNT_LIMIT = 500

export interface MessageIdQuery {
  labelId?: string
  q?: string
  after?: Date
  max: number
}

export interface MatchingIds {
  ids: string[]
  // The first id of each listing. Ids from different labels aren't ordered against each other,
  // so the newest message is among the heads.
  heads: string[]
  missingLabelIds: string[]
}

export interface MatchCount extends MatchingIds {
  count: number
  capped: boolean
}

export const listLabels = async ( userId: string ): Promise< GmailLabel[] > => {
  const { data } = await withGmail(
    userId,
    ( client ) => client.users.labels.list( { userId: 'me' } ),
  )

  return ( data.labels ?? [] ).flatMap( ( { id, name, type } ): GmailLabel[] => {
    if( !id || !name ) {
      return []
    }

    return [ { id, name, type: type === 'user' ? 'user' : 'system' } ]
  } )
}

const buildQuery = ( q: string | undefined, after: Date | undefined ): string | undefined => {
  const afterTerm = after === undefined
    ? undefined
    : `after:${ Math.floor( after.getTime() / 1000 ) }`

  return [ q, afterTerm ].filter( ( term ) => term !== undefined ).join( ' ' ) || undefined
}

export const listMessageIds = async (
  userId: string,
  { labelId, q, after, max }: MessageIdQuery,
): Promise< string[] > => {
  const query = buildQuery( q, after )
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const { data }: ListPage = await withGmail( userId, ( client ) => {
      return client.users.messages.list( {
        userId: 'me',
        ...labelId === undefined ? {} : { labelIds: [ labelId ] },
        ...query === undefined ? {} : { q: query },
        includeSpamTrash: false,
        maxResults: Math.min( max - ids.length, PAGE_SIZE_LIMIT ),
        pageToken,
      } )
    } )

    ids.push( ...( data.messages ?? [] ).flatMap( ( { id } ) => id ? [ id ] : [] ) )
    pageToken = data.nextPageToken ?? undefined
  } while( pageToken !== undefined && ids.length < max )

  return ids.slice( 0, max )
}

export const getMessage = async (
  userId: string,
  id: string,
  format: 'full' | 'metadata' = 'full',
): Promise< gmail_v1.Schema$Message > => {
  const { data } = await withGmail( userId, ( client ) => {
    return client.users.messages.get( { userId: 'me', id, format } )
  } )

  return data
}

// Gmail's labelIds filter means "all of these labels", so each label is listed on its own and
// the ids merged: an email with any of the labels matches (ADR 0035).
export const listMatchingIds = async (
  userId: string,
  match: GmailMatch,
  { after, max }: { after?: Date, max: number },
): Promise< MatchingIds > => {
  if( match.kind === 'query' ) {
    const ids = await listMessageIds( userId, { q: match.query, after, max } )

    return { ids, heads: ids.slice( 0, 1 ), missingLabelIds: [] }
  }

  const known = new Set( ( await listLabels( userId ) ).map( ( { id } ) => id ) )
  const missingLabelIds = match.label_ids.filter( ( id ) => !known.has( id ) )
  const merged = new Set< string >()
  const heads = new Set< string >()

  for( const labelId of match.label_ids.filter( ( id ) => known.has( id ) ) ) {
    const ids = await listMessageIds( userId, { labelId, after, max } )

    ids.forEach( ( id ) => merged.add( id ) )
    ids.slice( 0, 1 ).forEach( ( id ) => heads.add( id ) )
  }

  return { ids: [ ...merged ], heads: [ ...heads ], missingLabelIds }
}

export const countMatches = async (
  userId: string,
  match: GmailMatch,
): Promise< MatchCount > => {
  // One more than the limit tells "exactly 500" from "more than 500".
  const matching = await listMatchingIds( userId, match, { max: COUNT_LIMIT + 1 } )
  const { ids } = matching

  return {
    ...matching,
    count: Math.min( ids.length, COUNT_LIMIT ),
    capped: ids.length > COUNT_LIMIT,
  }
}
