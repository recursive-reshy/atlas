// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
// Shared
import type { HealthKind } from '@atlas/shared'
// App
import { useHealthErrors } from '#src/features/status/hooks/useHealthErrors'

interface ErrorHistoryProps {
  kind: HealthKind
  id: string
  name: string
}

export function ErrorHistory( { kind, id, name }: ErrorHistoryProps ): ReactElement {
  const { errors, isLoading, error } = useHealthErrors( kind, id, true )

  if( error !== null ) {
    return <Alert severity="error">{ error }</Alert>
  }

  if( isLoading && errors.length === 0 ) {
    return <Typography role="status" variant="body2">Loading errors…</Typography>
  }

  return (
    <List aria-label={ `Recent errors for ${ name }` } dense disablePadding>
      { errors.map( ( { at, message } ) => (
        <ListItem key={ `${ at }-${ message }` } disableGutters sx={ { display: 'block' } }>
          <Typography variant="caption" color="text.secondary" component="div">
            <time dateTime={ at }>{ new Date( at ).toLocaleString() }</time>
          </Typography>
          <Typography variant="body2" sx={ { overflowWrap: 'anywhere' } }>{ message }</Typography>
        </ListItem>
      ) ) }
    </List>
  )
}
