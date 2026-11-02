// Node
import { createHash } from 'node:crypto'
// Packages
import { parseFeed } from 'feedsmith'
import { parseHTML } from 'linkedom'
// Shared
import { ARTICLE_LIMITS, detectSourceType } from '@atlas/shared'
import type { SourceType } from '@atlas/shared'
// Errors
import { ValidationError } from '../errors.js'
// Clients
import { fetchResource } from '../clients/http.client.js'
// Sources
import { htmlToMarkdown } from './htmlToMarkdown.js'

const MAX_FEED_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html'
const FEED_LINK_TYPES = [ 'application/rss+xml', 'application/atom+xml', 'application/feed+json' ]
const NO_FEED = 'No feed found at this address'

export interface RawFeedItem {
  guid: string | null
  link: string
  title: string
  published_at: string | null
  author: string | null
  content_html: string | null
}

export interface ParsedFeed {
  title: string
  items: RawFeedItem[]
}

export interface FeedItemData extends RawFeedItem {
  item_key: string
  source_type: SourceType
  content_markdown: string | null
}

export interface DiscoveredFeed extends ParsedFeed {
  feedUrl: string
  etag: string | null
  lastModified: string | null
}

const text = ( value: unknown ): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  return trimmed === '' ? null : trimmed
}

const toIso = ( value: unknown ): string | null => {
  const parsed = new Date( text( value ) ?? '' )

  return text( value ) === null || Number.isNaN( parsed.getTime() ) ? null : parsed.toISOString()
}

const firstOf = ( ...values: unknown[] ): string | null => {
  for( const value of values ) {
    if( text( value ) !== null ) {
      return text( value )
    }
  }

  return null
}

const toItems = ( items: RawFeedItem[] ): RawFeedItem[] => {
  return items.filter( ( { link } ) => link !== '' )
}

export const parseFeedXml = ( xml: string ): ParsedFeed => {
  let result: ReturnType< typeof parseFeed >

  try {
    result = parseFeed( xml )
  } catch{
    throw new ValidationError( NO_FEED )
  }

  if( result.format === 'rss' ) {
    return {
      title: text( result.feed.title ) ?? '',
      items: toItems( ( result.feed.items ?? [] ).map( ( item ) => ( {
        guid: text( item.guid?.value ),
        link: text( item.link ) ?? '',
        title: text( item.title ) ?? '',
        published_at: toIso( item.pubDate ),
        author: firstOf( item.dc?.creators?.[ 0 ], item.authors?.[ 0 ]?.name ),
        content_html: firstOf( item.content?.encoded, item.description ),
      } ) ) ),
    }
  }

  if( result.format === 'atom' ) {
    return {
      title: text( result.feed.title?.value ) ?? '',
      items: toItems( ( result.feed.entries ?? [] ).map( ( entry ) => {
        const links = entry.links ?? []
        const alternate = links.find( ( { rel } ) => rel === undefined || rel === 'alternate' )

        return {
          guid: text( entry.id ),
          link: text( alternate?.href ) ?? '',
          title: text( entry.title?.value ) ?? '',
          published_at: toIso( entry.published ) ?? toIso( entry.updated ),
          author: text( entry.authors?.[ 0 ]?.name ),
          content_html: firstOf( entry.content?.value, entry.summary?.value ),
        }
      } ) ),
    }
  }

  if( result.format === 'rdf' ) {
    return {
      title: text( result.feed.title ) ?? '',
      items: toItems( ( result.feed.items ?? [] ).map( ( item ) => ( {
        guid: null,
        link: text( item.link ) ?? '',
        title: text( item.title ) ?? '',
        published_at: toIso( item.dc?.dates?.[ 0 ] ),
        author: text( item.dc?.creators?.[ 0 ] ),
        content_html: text( item.description ),
      } ) ) ),
    }
  }

  return {
    title: text( result.feed.title ) ?? '',
    items: toItems( ( result.feed.items ?? [] ).map( ( item ) => ( {
      guid: text( item.id ),
      link: text( item.url ) ?? '',
      title: text( item.title ) ?? '',
      published_at: toIso( item.date_published ),
      author: text( item.authors?.[ 0 ]?.name ),
      content_html: firstOf( item.content_html, item.content_text ),
    } ) ) ),
  }
}

type KeyFields = Pick< RawFeedItem, 'guid' | 'link' | 'title' | 'published_at' >

export const itemKey = ( { guid, link, title, published_at }: KeyFields ): string => {
  if( guid !== null ) {
    return guid
  }

  if( link !== '' ) {
    return link.split( '#' )[ 0 ] ?? link
  }

  return createHash( 'sha256' ).update( `${ title }${ published_at ?? '' }` ).digest( 'hex' )
}

export const toFeedItem = ( raw: RawFeedItem ): FeedItemData => {
  const sourceType = detectSourceType( raw.link )
  const markdown = sourceType === 'article' && raw.content_html !== null
    ? htmlToMarkdown( raw.content_html )
    : ''
  const isFullText = markdown.length >= ARTICLE_LIMITS.minExtractedChars
    && markdown.length <= ARTICLE_LIMITS.maxChars

  return {
    ...raw,
    item_key: itemKey( raw ),
    source_type: sourceType,
    content_markdown: isFullText ? markdown : null,
  }
}

const tryParse = ( xml: string ): ParsedFeed | undefined => {
  try {
    return parseFeedXml( xml )
  } catch( error ) {
    if( error instanceof ValidationError ) {
      return undefined
    }

    throw error
  }
}

const alternateFeedLink = ( html: string, baseUrl: string ): string | undefined => {
  const { document } = parseHTML( html )

  for( const link of document.querySelectorAll( 'link' ) ) {
    const rel = ( link.getAttribute( 'rel' ) ?? '' ).toLowerCase().split( /\s+/ )
    const type = ( link.getAttribute( 'type' ) ?? '' ).toLowerCase()
    const href = link.getAttribute( 'href' )

    if( rel.includes( 'alternate' ) && FEED_LINK_TYPES.includes( type ) && href !== null ) {
      return new URL( href, baseUrl ).href
    }
  }

  return undefined
}

interface Validators {
  etag?: string | undefined
  lastModified?: string | undefined
}

export const fetchFeed = async (
  url: string,
  validators: Validators = {},
): ReturnType< typeof fetchResource > => {
  const { etag, lastModified } = validators

  return fetchResource( url, {
    accept: ACCEPT,
    maxBytes: MAX_FEED_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    ...etag === undefined ? {} : { etag },
    ...lastModified === undefined ? {} : { lastModified },
  } )
}

export const discoverFeed = async ( url: string ): Promise< DiscoveredFeed > => {
  const page = await fetchFeed( url )
  const direct = tryParse( page.body )

  if( direct !== undefined ) {
    return {
      ...direct,
      feedUrl: page.finalUrl,
      etag: page.etag,
      lastModified: page.lastModified,
    }
  }

  const link = alternateFeedLink( page.body, page.finalUrl )

  if( link === undefined ) {
    throw new ValidationError( NO_FEED )
  }

  const linked = await fetchFeed( link )
  const parsed = tryParse( linked.body )

  if( parsed === undefined ) {
    throw new ValidationError( NO_FEED )
  }

  return {
    ...parsed,
    feedUrl: linked.finalUrl,
    etag: linked.etag,
    lastModified: linked.lastModified,
  }
}
