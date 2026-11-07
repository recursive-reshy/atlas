// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteResourceKind } from '@atlas/shared'
// App
import { useSuggestResources } from '#src/hooks/useSuggestResources'
import { searchUrl } from '#src/searchLink'

interface SuggestResourcesProps {
  conceptId: string
  conceptName: string
}

const KIND_LABELS: Record< MeleteResourceKind, string > = {
  book: 'Book',
  docs: 'Docs',
  course: 'Course',
  video: 'Video',
  article: 'Article',
  talk: 'Talk',
  other: 'Other',
}

// Resources from Claude's own knowledge (ADR 0093): no links, a search for each instead
export function SuggestResources(
  { conceptId, conceptName }: SuggestResourcesProps,
): ReactElement {
  const suggest = useSuggestResources()

  return (
    <Stack spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
      <Button
        size="small"
        disabled={ suggest.isPending }
        aria-label={ `Suggest resources for ${ conceptName }` }
        sx={ { minHeight: 44 } }
        onClick={ () => suggest.mutate( conceptId ) }
      >
        Suggest resources
      </Button>
      { suggest.isPending && (
        <Typography role="status" variant="body2" color="text.secondary">
          Asking Claude…
        </Typography>
      ) }
      { suggest.isError && <Alert severity="error">{ suggest.error?.message }</Alert> }
      { suggest.data !== undefined && (
        <Stack component="ul" spacing={ 1.5 } sx={ { m: 0, pl: 0, listStyle: 'none' } }>
          { suggest.data.suggestions.map( ( item ) => (
            <Stack component="li" key={ `${ item.title }-${ item.query }` }>
              <Typography>{ item.title }</Typography>
              <Typography variant="body2" color="text.secondary">
                { `${ KIND_LABELS[ item.kind ] }${ item.by === '' ? '' : ` · ${ item.by }` }` }
              </Typography>
              <Typography variant="body2">{ item.why }</Typography>
              <Link
                href={ searchUrl( item.kind, item.query ) }
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ `Search for ${ item.title }` }
                sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
              >
                Search
              </Link>
            </Stack>
          ) ) }
        </Stack>
      ) }
    </Stack>
  )
}
