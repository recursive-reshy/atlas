// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import type { GoalForm } from '#src/features/themis/goalForm'

interface GoalOutcomeFieldsProps {
  form: GoalForm
  onChange: < Key extends keyof GoalForm >( key: Key, value: GoalForm[ Key ] ) => void
}

const NATIVE = { select: { native: true } }

// The fields that belong to one outcome type: a metric's unit and target, a check-in's cadence
export function GoalOutcomeFields(
  { form, onChange }: GoalOutcomeFieldsProps,
): ReactElement | null {
  if( form.outcome === 'metric' ) {
    return (
      <Stack direction="row" spacing={ 2 }>
        <TextField
          label="Unit (optional)"
          value={ form.unit }
          onChange={ ( event ) => onChange( 'unit', event.target.value ) }
          slotProps={ { htmlInput: { maxLength: 20 } } }
        />
        <TextField
          label="Target"
          type="number"
          value={ form.target }
          onChange={ ( event ) => onChange( 'target', event.target.value ) }
        />
      </Stack>
    )
  }

  if( form.outcome === 'checkin' ) {
    return (
      <TextField
        select
        label="Cadence"
        value={ form.cadence }
        onChange={ ( event ) => {
          onChange( 'cadence', event.target.value === 'monthly' ? 'monthly' : 'weekly' )
        } }
        slotProps={ NATIVE }
      >
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </TextField>
    )
  }

  return null
}
