// Shared
import { SourceDocument, formatClock } from '@atlas/shared'
// Clients
import type { Summary } from '../clients/claude.client.js'
// Formatters
import { youTubeVideoId } from './youtube.js'

type Timestamped = Extract< Summary, { kind: 'video' } >[ 'key_points' ][ number ]

const singleLine = ( value: string ): string => value.replace( /\s*\r?\n\s*/g, ' ' ).trim()

const formatArticleSummary = ( summary: Extract< Summary, { kind: 'article' } > ): string => {
  const blocks = [ `## Summary\n\n${ summary.overview.trim() }` ]

  if( summary.key_points.length > 0 ) {
    const lines = summary.key_points.map( ( text ) => `- ${ singleLine( text ) }` )

    blocks.push( `## Key points\n\n${ lines.join( '\n' ) }` )
  }

  if( summary.quotes.length > 0 ) {
    const lines = summary.quotes.map( ( text ) => `> "${ singleLine( text ) }"` )

    blocks.push( `## Notable quotes\n\n${ lines.join( '\n' ) }` )
  }

  return `${ blocks.join( '\n\n' ) }\n`
}

export const formatSummary = ( summary: Summary, document: SourceDocument ): string => {
  if( summary.kind === 'article' ) {
    return formatArticleSummary( summary )
  }

  const videoId = youTubeVideoId( document.meta.source )

  const stamp = ( seconds: number ): string => {
    const label = formatClock( seconds )

    return videoId === undefined
      ? label
      : `[${ label }](https://youtu.be/${ videoId }?t=${ Math.floor( seconds ) })`
  }

  const blocks = [ `## Summary\n\n${ summary.overview.trim() }` ]

  if( summary.key_points.length > 0 ) {
    const lines = summary.key_points.map( ( { text, seconds }: Timestamped ) => {
      return `- ${ singleLine( text ) } (${ stamp( seconds ) })`
    } )

    blocks.push( `## Key points\n\n${ lines.join( '\n' ) }` )
  }

  if( summary.quotes.length > 0 ) {
    const lines = summary.quotes.map( ( { text, seconds }: Timestamped ) => {
      return `> "${ singleLine( text ) }" (${ stamp( seconds ) })`
    } )

    blocks.push( `## Notable quotes\n\n${ lines.join( '\n' ) }` )
  }

  return `${ blocks.join( '\n\n' ) }\n`
}
