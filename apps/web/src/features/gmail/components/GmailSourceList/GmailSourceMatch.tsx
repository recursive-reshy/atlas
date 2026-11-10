// React
import type { ReactElement } from 'react'
// Packages
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { GmailSource } from '@atlas/shared'

const QUERY_SX = { fontFamily: 'monospace', overflowWrap: 'anywhere' } as const

export function GmailSourceMatch( { source }: { source: GmailSource } ): ReactElement {
  if( source.match.kind === 'query' ) {
    return <Typography variant="body2" sx={ QUERY_SX }>{ source.match.query }</Typography>
  }

  return (
    <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 0.5 } }>
      { source.label_names.map( ( name ) => (
        <Chip key={ name } size="small" variant="outlined" label={ name } />
      ) ) }
    </Stack>
  )
}
