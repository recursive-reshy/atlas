// Packages
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
// Shared
import { ARTICLE_LIMITS } from '@atlas/shared'
import type { ArticleSource } from '@atlas/shared'
// Clients
import { fetchResource } from '../clients/http.client.js'
// Sources
import { htmlToMarkdown } from './htmlToMarkdown.js'

const MAX_PAGE_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

export class ArticleError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'ArticleError'
  }
}

const NOT_AN_ARTICLE = 'Not an article page'

const toPublishedDate = ( value: string | null | undefined ): string | null => {
  const text = value?.trim() ?? ''
  const date = /^\d{4}-\d{2}-\d{2}/.exec( text )?.[ 0 ]
  const parsed = new Date( date ?? text )

  if( text === '' || Number.isNaN( parsed.getTime() ) ) {
    return null
  }

  return date ?? parsed.toISOString().slice( 0, 10 )
}

export const extractArticle = ( html: string, baseUrl: string ): ArticleSource => {
  const { document } = parseHTML( html === '' ? '<html></html>' : html )
  const base = document.createElement( 'base' )

  base.setAttribute( 'href', baseUrl )
  document.head?.prepend( base )

  const article = new Readability( document ).parse()

  if( article === null ) {
    throw new ArticleError( NOT_AN_ARTICLE )
  }

  const markdown = htmlToMarkdown( article.content ?? '' )

  if( markdown.length < ARTICLE_LIMITS.minExtractedChars ) {
    throw new ArticleError( NOT_AN_ARTICLE )
  }

  if( markdown.length > ARTICLE_LIMITS.maxChars ) {
    throw new ArticleError(
      `Article is too long to summarize (${ markdown.length.toLocaleString( 'en-US' ) } `
      + `characters, limit ${ ARTICLE_LIMITS.maxChars.toLocaleString( 'en-US' ) })`,
    )
  }

  const hostname = new URL( baseUrl ).hostname.replace( /^www\./, '' )
  const title = article.title?.trim() ?? ''

  return {
    kind: 'article',
    meta: {
      title: title === '' ? document.title.trim() || hostname : title,
      source: baseUrl,
      author: article.byline?.trim() || null,
      site: article.siteName?.trim() || hostname,
      published: toPublishedDate( article.publishedTime ),
      fetched_at: new Date().toISOString(),
      origin: 'fetched',
    },
    markdown,
  }
}

export const fetchArticle = async ( url: string ): Promise< ArticleSource > => {
  const { body, contentType, finalUrl } = await fetchResource( url, {
    accept: 'text/html,application/xhtml+xml',
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
  } )

  if( contentType !== null && !/html/i.test( contentType ) ) {
    throw new ArticleError( NOT_AN_ARTICLE )
  }

  return extractArticle( body, finalUrl )
}
