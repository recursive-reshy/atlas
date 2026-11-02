// React
import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
// Shared
import { formatClock, groupParagraphs } from '@atlas/shared'
import type { SourceDocument, SourceType } from '@atlas/shared'

const PANE_SX = {
  position: 'relative',
  minWidth: 0,
  maxHeight: '32rem',
  overflowY: 'auto',
  px: 2,
  py: 1,
} as const

const PARAGRAPH_SX = {
  mb: 2,
  pl: 1,
  borderLeft: 4,
  borderColor: 'transparent',
  '&[aria-current="true"]': { borderColor: 'primary.main', fontWeight: 600 },
} as const

const STAMP_SX = { fontVariantNumeric: 'tabular-nums' } as const

const ARTICLE_TEXT_SX = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'inherit',
  m: 0,
} as const

const NAMES = { video: 'Transcript', article: 'Article' } as const

interface SourcePaneProps {
  source: SourceDocument | null
  sourceType: SourceType
  error: string | null
  focusSecond: number | null
}

export function SourcePane(
  { source, sourceType, error, focusSecond }: SourcePaneProps,
): ReactElement {
  const paneRef = useRef< HTMLDivElement >( null )
  const paragraphs = useMemo( () => {
    return source?.kind === 'video' ? groupParagraphs( source.segments ) : []
  }, [ source ] )

  const activeStart = useMemo( () => {
    if( focusSecond === null ) {
      return null
    }

    // The note cites whole seconds, while paragraphs start on a fraction of one.
    const started = paragraphs.filter( ( { start } ) => Math.floor( start ) <= focusSecond )

    return started.at( -1 )?.start ?? null
  }, [ paragraphs, focusSecond ] )

  useEffect( () => {
    if( activeStart === null || paneRef.current === null ) {
      return
    }

    const element = document.getElementById( `transcript-${ Math.floor( activeStart ) }` )

    if( element !== null ) {
      paneRef.current.scrollTop = element.offsetTop
    }
  }, [ activeStart ] )

  return (
    <Paper
      ref={ paneRef }
      component="section"
      variant="outlined"
      aria-label={ NAMES[ sourceType ] }
      sx={ PANE_SX }
    >
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { error === null && source === null && (
        <Typography role="status">{ `Loading ${ NAMES[ sourceType ].toLowerCase() }…` }</Typography>
      ) }
      { source?.kind === 'article' && (
        <>
          <Typography variant="h6" component="h3" sx={ { overflowWrap: 'anywhere' } }>
            { source.meta.title }
          </Typography>
          <Link
            href={ source.meta.source }
            target="_blank"
            rel="noopener noreferrer"
            sx={ { display: 'block', mb: 2, overflowWrap: 'anywhere' } }
          >
            { source.meta.source }
          </Link>
          <Typography component="pre" sx={ ARTICLE_TEXT_SX }>{ source.markdown }</Typography>
        </>
      ) }
      { paragraphs.map( ( { start, text } ) => (
        <Typography
          key={ start }
          component="p"
          id={ `transcript-${ Math.floor( start ) }` }
          aria-current={ start === activeStart ? 'true' : undefined }
          sx={ PARAGRAPH_SX }
        >
          <Typography component="span" color="text.secondary" sx={ STAMP_SX }>
            { `[${ formatClock( start ) }]` }
          </Typography>
          { ' ' }
          { text }
        </Typography>
      ) ) }
    </Paper>
  )
}
