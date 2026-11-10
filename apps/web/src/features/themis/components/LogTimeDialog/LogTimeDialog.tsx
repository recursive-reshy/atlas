// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import { useLogTime } from '#src/features/themis/hooks/useLogTime'
import { useMe } from '#src/app/useMe'
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { daysBefore, localDate } from '#src/lib/localDate'

interface LogTimeDialogProps {
  // The target it opens on; with neither, the person picks
  subjectId?: string
  goalId?: string
  onClose: () => void
}

const CHIPS = [ 15, 30, 45, 60, 90 ] as const
const MAX_DAYS_BACK = 365
const MAX_MINUTES = 1440

const startTarget = ( subjectId?: string, goalId?: string ): string => {
  if( subjectId !== undefined ) {
    return `subject:${ subjectId }`
  }

  return goalId === undefined ? '' : `goal:${ goalId }`
}

// Minutes against a subject or a goal, on a day up to a year back (ADR 0091); phone first
export function LogTimeDialog( { subjectId, goalId, onClose }: LogTimeDialogProps ): ReactElement {
  const titleId = useId()
  const modules = useMe().me?.modules ?? []
  const hasMelete = modules.includes( 'melete' )
  const hasThemis = modules.includes( 'themis' )
  const { today: melete } = useMeleteToday( hasMelete )
  const { overview } = useThemisOverview( 'week', hasThemis )
  const logTime = useLogTime()
  const now = new Date()
  const [ target, setTarget ] = useState( startTarget( subjectId, goalId ) )
  const [ minutes, setMinutes ] = useState( '' )
  const [ day, setDay ] = useState( localDate( now ) )
  const [ note, setNote ] = useState( '' )
  const subjects = hasMelete ? melete?.subjects ?? [] : []
  const goals = hasThemis ? overview?.areas.flatMap( ( { goals: cards } ) => cards ) ?? [] : []
  const count = Number( minutes )
  const isValid = target !== '' && day !== '' && minutes !== ''
    && Number.isInteger( count ) && count >= 1 && count <= MAX_MINUTES
  const isKnown = [ ...subjects.map( ( { id } ) => `subject:${ id }` ),
    ...goals.map( ( { goal } ) => `goal:${ goal.id }` ) ].includes( target )

  const handleSave = (): void => {
    const [ kind, id ] = target.split( ':' )
    const trimmed = note.trim()

    logTime.mutate(
      {
        ...( kind === 'subject' ? { subject_id: id } : { goal_id: id } ),
        day,
        minutes: count,
        ...( trimmed === '' ? {} : { note: trimmed } ),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Log time</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            select
            label="Subject or goal"
            value={ target }
            onChange={ ( event ) => setTarget( event.target.value ) }
            slotProps={ { select: { native: true }, inputLabel: { shrink: true } } }
          >
            <option value="">Choose…</option>
            { target !== '' && !isKnown && <option value={ target }>Selected</option> }
            { subjects.length > 0 && (
              <optgroup label="Subjects">
                { subjects.map( ( { id, name } ) => (
                  <option key={ id } value={ `subject:${ id }` }>{ name }</option>
                ) ) }
              </optgroup>
            ) }
            { goals.length > 0 && (
              <optgroup label="Goals">
                { goals.map( ( { goal } ) => (
                  <option key={ goal.id } value={ `goal:${ goal.id }` }>{ goal.name }</option>
                ) ) }
              </optgroup>
            ) }
          </TextField>
          <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 1 } }>
            { CHIPS.map( ( chip ) => (
              <Button
                key={ chip }
                size="small"
                variant={ count === chip ? 'contained' : 'outlined' }
                aria-pressed={ count === chip }
                onClick={ () => setMinutes( String( chip ) ) }
                sx={ { minHeight: 44, minWidth: 44 } }
              >
                { `${ chip } min` }
              </Button>
            ) ) }
          </Stack>
          <TextField
            label="Minutes"
            type="number"
            value={ minutes }
            onChange={ ( event ) => setMinutes( event.target.value ) }
            slotProps={ { htmlInput: { min: 1, max: MAX_MINUTES } } }
          />
          <TextField
            label="Day"
            type="date"
            value={ day }
            onChange={ ( event ) => setDay( event.target.value ) }
            slotProps={ {
              inputLabel: { shrink: true },
              htmlInput: { min: daysBefore( now, MAX_DAYS_BACK ), max: localDate( now ) },
            } }
          />
          <TextField
            label="Note (optional)"
            value={ note }
            onChange={ ( event ) => setNote( event.target.value ) }
            slotProps={ { htmlInput: { maxLength: 500 } } }
          />
          { logTime.error && <Alert severity="error">{ logTime.error.message }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onClose } sx={ { minHeight: 44 } }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ !isValid || logTime.isPending }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          Log time
        </Button>
      </DialogActions>
    </Dialog>
  )
}
