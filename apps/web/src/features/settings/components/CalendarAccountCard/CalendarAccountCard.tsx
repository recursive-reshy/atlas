// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { GetCalendarResponse } from '@atlas/shared'
// App
import { formatAgo } from '#src/lib/checkedAt'

interface CalendarAccountCardProps {
  calendar: GetCalendarResponse
  isBusy: boolean
  // For the "5m ago" text; tests pass a fixed time
  now?: number
  onConnect: () => void
  onSync: () => void
  onChange: () => void
  onDisconnect: () => void
}

const BUTTON_SX = { minHeight: 44 }

export function CalendarAccountCard(
  { calendar, isBusy, now = new Date().getTime(), onConnect, onSync, onChange, onDisconnect }:
  CalendarAccountCardProps,
): ReactElement {
  if( calendar.status === 'not_configured' ) {
    return (
      <Typography>
        Google Calendar isn&apos;t set up. Add CALENDAR_REDIRECT_URI to .env, with the Google
        client and TOKEN_ENCRYPTION_KEY Gmail already uses, and restart the app.
      </Typography>
    )
  }

  if( calendar.status === 'not_connected' ) {
    return (
      <Stack direction="row" spacing={ 2 } sx={ { alignItems: 'center' } }>
        <Typography color="text.secondary">Not connected</Typography>
        <Button variant="contained" onClick={ onConnect } sx={ BUTTON_SX }>
          Connect Google Calendar
        </Button>
      </Stack>
    )
  }

  if( calendar.status === 'broken' ) {
    return (
      <Alert
        severity="warning"
        action={ (
          <Stack direction="row">
            <Button onClick={ onConnect } sx={ BUTTON_SX }>Reconnect</Button>
            <Button onClick={ onDisconnect } sx={ BUTTON_SX }>Disconnect</Button>
          </Stack>
        ) }
      >
        Reconnect needed. { calendar.error } Your imported time is kept.
      </Alert>
    )
  }

  return (
    <Stack spacing={ 1 }>
      <Typography>{ `Connected as ${ calendar.email ?? '' }` }</Typography>
      { calendar.calendar !== undefined && (
        <Typography variant="body2" color="text.secondary">
          { `Calendar: ${ calendar.calendar.name }`
            + ` · Importing from ${ calendar.import_from ?? '' }` }
        </Typography>
      ) }
      <Typography variant="body2" color="text.secondary">
        { calendar.last_synced_at === undefined
          ? 'Not synced yet'
          : `Last synced ${ formatAgo( calendar.last_synced_at, now ) }` }
      </Typography>
      <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button variant="outlined" disabled={ isBusy } onClick={ onSync } sx={ BUTTON_SX }>
          { isBusy ? 'Syncing…' : 'Sync now' }
        </Button>
        <Button variant="outlined" onClick={ onChange } sx={ BUTTON_SX }>Change calendar</Button>
        <Button variant="outlined" onClick={ onDisconnect } sx={ BUTTON_SX }>Disconnect</Button>
      </Stack>
    </Stack>
  )
}
