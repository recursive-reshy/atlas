// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { useCalendar } from '#src/features/themis/hooks/useCalendar'
import { useCalendarRedirectNotice } from '#src/features/themis/hooks/useCalendarRedirectNotice'
import { useConnectCalendar } from '#src/features/themis/hooks/useConnectCalendar'
import {
  useDisconnectCalendar,
  useSyncCalendarNow,
} from '#src/features/themis/hooks/useCalendarMutations'
import { CalendarAccountCard } from '../CalendarAccountCard'
import { CalendarChooser } from '../CalendarChooser'
import { DisconnectCalendarDialog } from '../DisconnectCalendarDialog'

// Settings › Sources: connect, choose, sync and disconnect (ADR 0108)
export function CalendarSettings(): ReactElement {
  const { calendar, isLoading, error } = useCalendar()
  const { notice, clear } = useCalendarRedirectNotice()
  const connect = useConnectCalendar()
  const sync = useSyncCalendarNow()
  const disconnect = useDisconnectCalendar()
  const [ isChanging, setIsChanging ] = useState( false )
  const [ isConfirming, setIsConfirming ] = useState( false )
  const isConnected = calendar?.status === 'connected'
  const hasChoice = calendar?.calendar !== undefined
  const failure = [ connect, sync, disconnect ].find( ( { isError } ) => isError )?.error

  const handleDisconnect = ( removeTime: boolean ): void => {
    setIsConfirming( false )
    disconnect.mutate( removeTime )
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">Google Calendar</Typography>
      { isLoading && <Typography role="status">Loading Google Calendar…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { failure !== undefined && failure !== null && (
        <Alert severity="error">{ failure.message }</Alert>
      ) }
      { calendar !== null && ( !isConnected || hasChoice ) && (
        <CalendarAccountCard
          calendar={ calendar }
          isBusy={ sync.isPending }
          onConnect={ () => connect.mutate() }
          onSync={ () => sync.mutate() }
          onChange={ () => setIsChanging( true ) }
          onDisconnect={ () => setIsConfirming( true ) }
        />
      ) }
      { isConnected && ( !hasChoice || isChanging ) && (
        <CalendarChooser
          currentId={ calendar.calendar?.id }
          importFrom={ calendar.import_from }
          onDone={ () => setIsChanging( false ) }
          onCancel={ hasChoice ? () => setIsChanging( false ) : undefined }
        />
      ) }
      <DisconnectCalendarDialog
        open={ isConfirming }
        onConfirm={ handleDisconnect }
        onCancel={ () => setIsConfirming( false ) }
      />
      <Snackbar
        open={ notice !== null }
        autoHideDuration={ 8000 }
        onClose={ clear }
        anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
      >
        <Alert severity={ notice?.severity ?? 'info' } onClose={ clear }>
          { notice?.message }
        </Alert>
      </Snackbar>
    </Stack>
  )
}
