// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useCalendarChoices } from '#src/features/themis/hooks/useCalendarChoices'
import { useSelectCalendar } from '#src/features/themis/hooks/useCalendarMutations'
import { daysBefore, localDate } from '#src/lib/localDate'

interface CalendarChooserProps {
  // What is chosen now, when changing it
  currentId?: string
  importFrom?: string
  onDone: () => void
  // Given only when there is a choice to go back to
  onCancel?: () => void
}

const DEFAULT_DAYS_BACK = 14
const MAX_DAYS_BACK = 365

// The same rules as the server, so the button says no before the request does
const dateProblem = ( day: string, today: Date ): string | null => {
  if( day === '' ) {
    return 'Pick a start date'
  }

  if( day > localDate( today ) ) {
    return 'The start date is in the future'
  }

  return day < daysBefore( today, MAX_DAYS_BACK ) ? 'The start date is more than a year back' : null
}

// Which calendar to read and from which day (ADR 0108)
export function CalendarChooser(
  { currentId, importFrom, onDone, onCancel }: CalendarChooserProps,
): ReactElement {
  const today = new Date()
  const { choices, isLoading, error } = useCalendarChoices( true )
  const select = useSelectCalendar()
  const [ picked, setPicked ] = useState< string | null >( null )
  const [ day, setDay ] = useState( importFrom ?? daysBefore( today, DEFAULT_DAYS_BACK ) )
  const calendarId = picked ?? currentId ?? choices.find( ( { primary } ) => primary )?.id
    ?? choices[ 0 ]?.id ?? ''
  const problem = dateProblem( day, today )
  const canSave = calendarId !== '' && problem === null && !select.isPending

  const handleSave = (): void => {
    select.mutate(
      { calendar_id: calendarId, import_from: day },
      { onSuccess: onDone },
    )
  }

  return (
    <Stack spacing={ 2 } sx={ { maxWidth: '24rem' } }>
      { isLoading && <Typography role="status">Loading calendars…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { select.isError && <Alert severity="error">{ select.error.message }</Alert> }
      <TextField
        select
        label="Calendar"
        value={ calendarId }
        onChange={ ( event ) => setPicked( event.target.value ) }
        slotProps={ { select: { native: true } } }
      >
        { choices.map( ( { id, name } ) => <option key={ id } value={ id }>{ name }</option> ) }
      </TextField>
      <TextField
        type="date"
        label="Import events from"
        value={ day }
        onChange={ ( event ) => setDay( event.target.value ) }
        error={ problem !== null }
        helperText={ problem ?? 'Events before this day are never imported' }
        slotProps={ { inputLabel: { shrink: true } } }
      />
      <Stack direction="row" spacing={ 1 }>
        <Button
          variant="contained"
          disabled={ !canSave }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          Save
        </Button>
        { onCancel !== undefined && (
          <Button onClick={ onCancel } sx={ { minHeight: 44 } }>Cancel</Button>
        ) }
      </Stack>
    </Stack>
  )
}
