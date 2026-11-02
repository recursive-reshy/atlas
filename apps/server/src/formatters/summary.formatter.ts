// Clients
import type { Summary } from '../clients/claude.client.js'

const singleLine = ( value: string ): string => value.replace( /\s*\r?\n\s*/g, ' ' ).trim()

// A video summary has the article's shape: no timestamps and no links to a moment (ADR 0074)
export const formatSummary = ( summary: Summary ): string => {
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
