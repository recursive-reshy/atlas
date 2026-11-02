// Shared
import { Transcript, groupParagraphs } from '@atlas/shared'

export const formatTxt = ( { segments }: Transcript ): string => {
  const paragraphs = groupParagraphs( segments )

  if( paragraphs.length === 0 ) {
    return ''
  }

  return `${ paragraphs.map( ( { text } ) => text ).join( '\n\n' ) }\n`
}
