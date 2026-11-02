// Shared
import { SourceDocument, cleanText, normalizeTag } from '@atlas/shared'
// Clients
import type { Summary } from '../clients/claude.client.js'

const MAX_TAGS = 5

const cleanTags = ( tags: string[] ): string[] => {
  return tags
    .map( normalizeTag )
    .filter( ( tag, index, all ) => {
      return tag !== '' && tag !== 'mnemosyne' && all.indexOf( tag ) === index
    } )
    .slice( 0, MAX_TAGS )
}

// Markdown marks, link URLs and typographic quotes are not part of what a reader would quote.
const normalizeForQuote = ( text: string ): string => {
  return cleanText(
    text
      .replace( /\[([^\]]*)\]\([^)]*\)/g, '$1' )
      .replace( /[*_`]/g, '' )
      .replace( /[\u2018\u2019]/g, '\'' )
      .replace( /[\u201C\u201D]/g, '"' ),
  )
}

export const cleanSummary = ( summary: Summary, document: SourceDocument ): Summary => {
  const tags = cleanTags( summary.tags )

  if( summary.kind === 'article' ) {
    const text = document.kind === 'article' ? normalizeForQuote( document.markdown ) : ''

    return {
      kind: 'article',
      overview: summary.overview,
      key_points: summary.key_points,
      quotes: summary.quotes
        .map( cleanText )
        .filter( ( quote ) => quote !== '' && text.includes( normalizeForQuote( quote ) ) ),
      tags,
    }
  }

  if( document.kind !== 'video' ) {
    return { ...summary, tags }
  }

  const spoken = cleanText( document.text )
  const isInRange = ( { seconds }: { seconds: number } ): boolean => {
    return seconds >= 0 && seconds <= document.meta.duration_seconds
  }

  return {
    kind: 'video',
    overview: summary.overview,
    key_points: summary.key_points.filter( isInRange ),
    quotes: summary.quotes
      .map( ( quote ) => ( { ...quote, text: cleanText( quote.text ) } ) )
      .filter( ( quote ) => quote.text !== '' && spoken.includes( quote.text ) )
      .filter( isInRange ),
    tags,
  }
}
