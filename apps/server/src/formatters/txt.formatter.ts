// Shared
import { VideoSource, splitParagraphs } from '@atlas/shared'

export const formatTxt = ( { text }: Pick< VideoSource, 'meta' | 'text' > ): string => {
  const paragraphs = splitParagraphs( text )

  if( paragraphs.length === 0 ) {
    return ''
  }

  return `${ paragraphs.join( '\n\n' ) }\n`
}
