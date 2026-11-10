// React
import type { ReactElement } from 'react'
// Packages
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { StatusRow } from '@atlas/shared'
// App
import { GMAIL_CONNECT_URL } from '#src/features/gmail/api/gmail.api'

interface RowControlsProps {
  row: StatusRow
  isOpen: boolean
  onToggle: () => void
}

// What a failing row adds under its state: the latest error, Reconnect for Gmail, the history.
export function RowControls( { row, isOpen, onToggle }: RowControlsProps ): ReactElement | null {
  if( row.state !== 'failing' ) {
    return null
  }

  const label = `${ isOpen ? 'Hide' : 'Show' } recent errors for ${ row.name }`

  return (
    <Stack spacing={ 0.5 }>
      <Typography variant="body2" color="error" sx={ { overflowWrap: 'anywhere' } }>
        { row.last_error }
      </Typography>
      <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
        { row.kind === 'gmail_connection' && (
          <Button size="small" variant="outlined" component="a" href={ GMAIL_CONNECT_URL }>
            Reconnect
          </Button>
        ) }
        <IconButton size="small" aria-label={ label } aria-expanded={ isOpen } onClick={ onToggle }>
          { isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon /> }
        </IconButton>
      </Stack>
    </Stack>
  )
}
