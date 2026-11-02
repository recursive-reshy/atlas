// Shared
import type { ArticleMeta, ArticleSource } from '@atlas/shared'

const MAX_TITLE_CHARS = 120

interface TextInput {
  url: string
  text: string
  title?: string
  origin: ArticleMeta[ 'origin' ]
  author?: string | null
  site?: string | null
  published?: string | null
}

const stripMarkup = ( value: string ): string => {
  return value
    .replace( /\[([^\]]*)\]\([^)]*\)/g, '$1' )
    .replace( /[*_`]/g, '' )
    .replace( /\s+#+\s*$/, '' )
    .trim()
}

const titleFrom = ( text: string, url: string ): string => {
  const heading = /^#{1,6}[ \t]+(\S.*)$/m.exec( text )?.[ 1 ]
  const fromHeading = heading === undefined ? '' : stripMarkup( heading )

  if( fromHeading !== '' ) {
    return fromHeading
  }

  const line = text
    .split( '\n' )
    .map( ( candidate ) => candidate.trim() )
    .find( ( candidate ) => candidate !== '' && !/^#+$/.test( candidate ) )

  if( line !== undefined ) {
    return line.slice( 0, MAX_TITLE_CHARS ).trim()
  }

  return new URL( url ).hostname.replace( /^www\./, '' )
}

export const articleFromText = ( input: TextInput ): ArticleSource => {
  const markdown = input.text.trim()
  const given = input.title?.trim() ?? ''

  return {
    kind: 'article',
    meta: {
      title: given === '' ? titleFrom( markdown, input.url ) : given,
      source: input.url,
      author: input.author ?? null,
      site: input.site ?? null,
      published: input.published ?? null,
      fetched_at: new Date().toISOString(),
      origin: input.origin,
    },
    markdown,
  }
}
