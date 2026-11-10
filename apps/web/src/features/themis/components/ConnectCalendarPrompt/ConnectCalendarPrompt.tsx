// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { CalendarConnectionStatus } from '@atlas/shared'
// App
import { useCalendarPromptDismissal } from '#src/features/themis/hooks/useCalendarPromptDismissal'
import { useConnectCalendar } from '#src/features/themis/hooks/useConnectCalendar'

interface ConnectCalendarPromptProps {
  status: CalendarConnectionStatus
}

// Shown only to a user whose calendar is not connected, until they dismiss it (ADR 0109)
export function ConnectCalendarPrompt(
  { status }: ConnectCalendarPromptProps,
): ReactElement | null {
  const { isDismissed, dismiss } = useCalendarPromptDismissal()
  const connect = useConnectCalendar()

  if( status !== 'not_connected' || isDismissed ) {
    return null
  }

  return (
    <Paper variant="outlined" sx={ { p: 2 } }>
      <Stack spacing={ 1 }>
        <Typography>
          Bring your meetings and calendar events into Themis as time you can review and count.
        </Typography>
        { connect.isError && <Alert severity="error">{ connect.error.message }</Alert> }
        <Stack direction="row" spacing={ 1 }>
          <Button
            variant="contained"
            disabled={ connect.isPending }
            onClick={ () => connect.mutate() }
            sx={ { minHeight: 44 } }
          >
            Connect Google Calendar
          </Button>
          <Button onClick={ dismiss } sx={ { minHeight: 44 } }>Dismiss</Button>
        </Stack>
      </Stack>
    </Paper>
  )
}
