// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { PreviewGmailSourceResponse } from '@atlas/shared'
// App
import { formatDate } from '#src/lib/formatDate'

interface GmailPreviewSummaryProps {
  preview: PreviewGmailSourceResponse
  // What happens to the matching emails, when that depends on the form.
  intake?: string
  // A source being edited isn't an overlap of itself.
  ignoreSourceId?: string
}

const countLine = ( { count, count_capped }: PreviewGmailSourceResponse ): string => {
  if( count_capped ) {
    return `${ count }+ emails match`
  }

  return `${ count } ${ count === 1 ? 'email matches' : 'emails match' }`
}

const newestLine = ( { newest }: PreviewGmailSourceResponse ): string | null => {
  if( newest === null ) {
    return null
  }

  const date = formatDate( newest.received_at )

  return `Newest: ${ newest.subject } from ${ newest.from }${ date === '' ? '' : `, ${ date }` }`
}

export function GmailPreviewSummary(
  { preview, intake, ignoreSourceId }: GmailPreviewSummaryProps,
): ReactElement {
  const newest = newestLine( preview )
  const overlaps = preview.overlaps.filter( ( { id } ) => id !== ignoreSourceId )

  return (
    <Stack spacing={ 1 }>
      <Typography sx={ { fontWeight: 600 } }>{ countLine( preview ) }</Typography>
      { newest !== null && (
        <Typography variant="body2" color="text.secondary">{ newest }</Typography>
      ) }
      { intake !== undefined && (
        <Typography variant="body2" color="text.secondary">{ intake }</Typography>
      ) }
      { preview.count === 0 && (
        <Alert severity="warning">No emails match this yet. You can still save it.</Alert>
      ) }
      { overlaps.length > 0 && (
        <Alert severity="warning">
          { `Overlaps with ${ overlaps.map( ( { name } ) => name ).join( ', ' ) }. `
            + 'An email matched by two sources is processed by each.' }
        </Alert>
      ) }
    </Stack>
  )
}
