// React
import { useMemo } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
// Shared
import { splitParagraphs } from '@atlas/shared'
import type { SourceDocument, SourceType } from '@atlas/shared'

const PANE_SX = {
  position: 'relative',
  minWidth: 0,
  maxHeight: '32rem',
  overflowY: 'auto',
  px: 2,
  py: 1,
} as const

const PARAGRAPH_SX = { mb: 2 } as const

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
}

export function SourcePane(
  { source, sourceType, error }: SourcePaneProps,
): ReactElement {
  const paragraphs = useMemo( () => {
    return source?.kind === 'video' ? splitParagraphs( source.text ) : []
  }, [ source ] )

  return (
    <Paper
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
      { source?.kind === 'video' && source.meta.truncated === true && (
        <Alert severity="warning" role="note" sx={ { mb: 2 } }>
          Transcript was cut short by Gemini&apos;s output limit
        </Alert>
      ) }
      { paragraphs.map( ( text, index ) => (
        <Typography key={ index } component="p" sx={ PARAGRAPH_SX }>{ text }</Typography>
      ) ) }
    </Paper>
  )
}
