export const cleanText = ( text: string ): string => {
  return text.replace( /\s+/g, ' ' ).trim()
}

const LONG_BLOCK_CHARS = 1200
const MIN_PARAGRAPH_CHARS = 400
const MAX_PARAGRAPH_CHARS = 800

const toSentences = ( block: string ): string[] => {
  const sentences = block.match( /[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g ) ?? [ block ]

  return sentences.map( ( sentence ) => sentence.trim() ).filter( ( sentence ) => sentence !== '' )
}

// A sentence longer than a paragraph (no punctuation) is cut at word boundaries
const toPieces = ( sentence: string ): string[] => {
  if( sentence.length <= MAX_PARAGRAPH_CHARS ) {
    return [ sentence ]
  }

  const pieces: string[] = []
  let current = ''

  for( const word of sentence.split( /\s+/ ) ) {
    if( current !== '' && current.length + 1 + word.length > MAX_PARAGRAPH_CHARS ) {
      pieces.push( current )
      current = word
    } else {
      current = current === '' ? word : `${ current } ${ word }`
    }
  }

  return current === '' ? pieces : [ ...pieces, current ]
}

const splitLongBlock = ( block: string ): string[] => {
  const paragraphs: string[] = []
  let current = ''

  for( const piece of toSentences( block ).flatMap( toPieces ) ) {
    if( current !== '' && current.length + 1 + piece.length > MAX_PARAGRAPH_CHARS ) {
      paragraphs.push( current )
      current = ''
    }

    current = current === '' ? piece : `${ current } ${ piece }`

    if( current.length >= MIN_PARAGRAPH_CHARS ) {
      paragraphs.push( current )
      current = ''
    }
  }

  return current === '' ? paragraphs : [ ...paragraphs, current ]
}

export const splitParagraphs = ( text: string ): string[] => {
  return text
    .split( /\n\s*\n/ )
    .map( ( block ) => block.trim() )
    .filter( ( block ) => block !== '' )
    .flatMap( ( block ) => block.length > LONG_BLOCK_CHARS ? splitLongBlock( block ) : [ block ] )
}
