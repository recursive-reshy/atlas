// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// App
import { useApproveMatched } from '#src/features/themis/hooks/useCalendarDraftMutations'
import { useCalendar } from '#src/features/themis/hooks/useCalendar'
import { useCalendarDrafts } from '#src/features/themis/hooks/useCalendarDrafts'
import { useCalendarSync } from '#src/features/themis/hooks/useCalendarSync'
import { useSyncCalendarNow } from '#src/features/themis/hooks/useCalendarMutations'
import { useTimeTargets } from '#src/features/themis/hooks/useTimeTargets'
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { CalendarDraftRow } from '../CalendarDraftRow'

interface CalendarDraftsProps {
  onMakeRule: ( title: string ) => void
}

const BUTTON_SX = { minHeight: 44 }

const recordedMessage = ( seconds: number ): string => (
  seconds === 0
    ? 'Nothing to record: measured time already covered it'
    : `Recorded ${ formatStudyTime( seconds ) }`
)

// Events waiting for review, newest first; opening the tab reads the calendar (ADR 0109)
export function CalendarDrafts( { onMakeRule }: CalendarDraftsProps ): ReactElement {
  const { calendar } = useCalendar()
  const isConnected = calendar?.status === 'connected'
  const { drafts, isLoading, error } = useCalendarDrafts()
  const { subjects, goals } = useTimeTargets()
  const sync = useSyncCalendarNow()
  const approveAll = useApproveMatched()
  const [ message, setMessage ] = useState< string | null >( null )
  const matched = drafts.filter( ( { assigned_by: by } ) => by === 'rule' ).length
  const failure = [ sync, approveAll ].find( ( { isError } ) => isError )?.error

  useCalendarSync( isConnected )

  const handleApproveAll = (): void => {
    approveAll.mutateAsync().then(
      ( approved ) => setMessage(
        `Approved ${ approved } ${ approved === 1 ? 'draft' : 'drafts' }`,
      ),
      () => undefined,
    )
  }

  return (
    <Stack spacing={ 2 }>
      <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button
          variant="outlined"
          disabled={ !isConnected || sync.isPending }
          onClick={ () => sync.mutate() }
          sx={ BUTTON_SX }
        >
          { sync.isPending ? 'Syncing…' : 'Sync now' }
        </Button>
        <Button
          variant="contained"
          disabled={ matched === 0 || approveAll.isPending }
          onClick={ handleApproveAll }
          sx={ BUTTON_SX }
        >
          { `Approve all matched (${ matched })` }
        </Button>
      </Stack>
      { calendar !== null && !isConnected && (
        <Link component={ RouterLink } to="/settings/sources" sx={ { minHeight: 44 } }>
          { calendar.status === 'broken'
            ? 'Reconnect the calendar in Settings'
            : 'Connect a calendar in Settings' }
        </Link>
      ) }
      { message !== null && <Typography role="status">{ message }</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { failure !== undefined && failure !== null && (
        <Alert severity="error">{ failure.message }</Alert>
      ) }
      { isLoading && <Typography role="status">Loading drafts…</Typography> }
      { !isLoading && error === null && drafts.length === 0 && (
        <Typography color="text.secondary">No calendar drafts to review</Typography>
      ) }
      <Stack component="ul" spacing={ 2 } sx={ { m: 0, p: 0 } }>
        { drafts.map( ( draft ) => (
          <CalendarDraftRow
            key={ draft.id }
            draft={ draft }
            subjects={ subjects }
            goals={ goals }
            onMakeRule={ onMakeRule }
            onRecorded={ ( seconds ) => setMessage( recordedMessage( seconds ) ) }
          />
        ) ) }
      </Stack>
    </Stack>
  )
}
