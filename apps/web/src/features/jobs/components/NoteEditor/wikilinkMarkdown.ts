// Only the parts of mdast-util-to-markdown's handler contract that this handler uses.
interface TextNode {
  value: string
}

interface HandlerState {
  safe: ( value: string, config: { before: string, after: string } ) => string
}

interface HandlerInfo {
  before: string
  after: string
}

const WIKILINK = /\[\[[^[\]\n]+\]\]/g

// mdast-util-to-markdown escapes every "[" in text; [[Note]] and [[Note|alias]] must stay as typed.
export const wikilinkTextHandler = (
  node: TextNode,
  _parent: unknown,
  state: HandlerState,
  info: HandlerInfo,
): string => {
  const { value } = node
  const escape = ( start: number, end: number ): string => {
    return state.safe( value.slice( start, end ), {
      before: start === 0 ? info.before : value.charAt( start - 1 ),
      after: end === value.length ? info.after : value.charAt( end ),
    } )
  }

  let result = ''
  let position = 0

  for( const match of value.matchAll( WIKILINK ) ) {
    result += escape( position, match.index ) + match[ 0 ]
    position = match.index + match[ 0 ].length
  }

  return result + escape( position, value.length )
}
