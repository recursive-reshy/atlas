// React
import type { ReactElement } from 'react'
// Packages
import TextField from '@mui/material/TextField'
// App
import type { TimeTarget } from '#src/features/themis/hooks/useTimeTargets'

interface TargetSelectProps {
  label: string
  // 'subject:<id>' or 'goal:<id>', or '' for none
  value: string
  subjects: TimeTarget[]
  goals: TimeTarget[]
  onChange: ( value: string ) => void
}

// One select of subjects and goals, shared by logging time and the calendar's drafts and rules
export function TargetSelect(
  { label, value, subjects, goals, onChange }: TargetSelectProps,
): ReactElement {
  const isKnown = [
    ...subjects.map( ( { id } ) => `subject:${ id }` ),
    ...goals.map( ( { id } ) => `goal:${ id }` ),
  ].includes( value )

  return (
    <TextField
      select
      label={ label }
      value={ value }
      onChange={ ( event ) => onChange( event.target.value ) }
      slotProps={ { select: { native: true }, inputLabel: { shrink: true } } }
    >
      <option value="">Choose…</option>
      { value !== '' && !isKnown && <option value={ value }>Selected</option> }
      { subjects.length > 0 && (
        <optgroup label="Subjects">
          { subjects.map( ( { id, name } ) => (
            <option key={ id } value={ `subject:${ id }` }>{ name }</option>
          ) ) }
        </optgroup>
      ) }
      { goals.length > 0 && (
        <optgroup label="Goals">
          { goals.map( ( { id, name } ) => (
            <option key={ id } value={ `goal:${ id }` }>{ name }</option>
          ) ) }
        </optgroup>
      ) }
    </TextField>
  )
}
