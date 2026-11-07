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
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisGoal } from '@atlas/shared'
// App
import {
  canSubmit,
  createBody,
  emptyForm,
  formFromGoal,
  updateBody,
} from '#src/goalForm'
import type { GoalForm } from '#src/goalForm'
import { useCreateGoal, useUpdateGoal } from '#src/hooks/useGoalMutations'
import { GoalOutcomeFields } from '../GoalOutcomeFields'

interface GoalDialogProps {
  // null makes a new goal
  goal: ThemisGoal | null
  // The area a new goal starts in
  areaId: string | null
  areas: { id: string, name: string }[]
  onClose: () => void
}

const OUTCOMES = [
  { value: 'learning', label: 'Learning' },
  { value: 'metric', label: 'Metric' },
  { value: 'checkin', label: 'Check-in' },
] as const

const NATIVE = { select: { native: true } }
const outcomeLabel = ( outcome: string ): string => {
  return OUTCOMES.find( ( { value } ) => value === outcome )?.label ?? ''
}
const SHRINK = { inputLabel: { shrink: true } }

// A goal's outcome type is chosen once; editing shows it but can't change it (ADR 0092)
export function GoalDialog( { goal, areaId, areas, onClose }: GoalDialogProps ): ReactElement {
  const titleId = useId()
  const [ form, setForm ] = useState< GoalForm >(
    () => goal === null ? emptyForm( areaId ?? areas[ 0 ]?.id ?? '' ) : formFromGoal( goal ),
  )
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const error = goal === null ? create.error : update.error
  const set = < Key extends keyof GoalForm >( key: Key, value: GoalForm[ Key ] ): void => {
    setForm( ( current ) => ( { ...current, [ key ]: value } ) )
  }

  const handleSave = (): void => {
    if( goal === null ) {
      create.mutate( createBody( form ), { onSuccess: onClose } )

      return
    }

    const body = updateBody( goal, form )

    if( Object.keys( body ).length === 0 ) {
      onClose()
    } else {
      update.mutate( { id: goal.id, body }, { onSuccess: onClose } )
    }
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>{ goal === null ? 'New goal' : 'Edit goal' }</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            label="Goal name"
            value={ form.name }
            autoFocus
            onChange={ ( event ) => set( 'name', event.target.value ) }
            slotProps={ { htmlInput: { maxLength: 120 } } }
          />
          <TextField
            select
            label="Area"
            value={ form.areaId }
            onChange={ ( event ) => set( 'areaId', event.target.value ) }
            slotProps={ NATIVE }
          >
            { areas.map( ( { id, name } ) => <option key={ id } value={ id }>{ name }</option> ) }
          </TextField>
          { goal === null ? (
            <TextField
              select
              label="Outcome"
              value={ form.outcome }
              onChange={ ( event ) => {
                set( 'outcome', OUTCOMES.find( ( { value } ) => value === event.target.value )
                  ?.value ?? 'learning' )
              } }
              slotProps={ NATIVE }
            >
              { OUTCOMES.map( ( { value, label } ) => (
                <option key={ value } value={ value }>{ label }</option>
              ) ) }
            </TextField>
          ) : (
            <Typography variant="body2" color="text.secondary">
              { `Outcome: ${ outcomeLabel( form.outcome ) } (fixed)` }
            </Typography>
          ) }
          <GoalOutcomeFields form={ form } onChange={ set } />
          <TextField
            label="Target date (optional)"
            type="date"
            value={ form.targetDate }
            onChange={ ( event ) => set( 'targetDate', event.target.value ) }
            slotProps={ SHRINK }
          />
          { goal !== null && (
            <TextField
              select
              label="Status"
              value={ form.status }
              onChange={ ( event ) => {
                const { value } = event.target

                set( 'status', value === 'achieved' || value === 'dropped' ? value : 'active' )
              } }
              slotProps={ NATIVE }
            >
              <option value="active">Active</option>
              <option value="achieved">Achieved</option>
              <option value="dropped">Dropped</option>
            </TextField>
          ) }
          { error && <Alert severity="error">{ error.message }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onClose } sx={ { minHeight: 44 } }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ !canSubmit( form ) || create.isPending || update.isPending }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          { goal === null ? 'Create goal' : 'Save' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
