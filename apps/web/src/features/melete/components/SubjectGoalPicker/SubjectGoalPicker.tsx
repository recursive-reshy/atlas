// React
import type { ReactElement } from 'react'
// Packages
import TextField from '@mui/material/TextField'
// Shared
import type { MeleteSubject, UpdateMeleteSubjectBody } from '@atlas/shared'
// App
import { useMe } from '#src/app/useMe'
import { useThemisOverview } from '#src/hooks/useThemisOverview'

interface SubjectGoalPickerProps {
  subject: MeleteSubject
  onUpdate: ( body: UpdateMeleteSubjectBody ) => void
}

// Links the subject to one of the user's active goals; only for a user who has Themis
export function SubjectGoalPicker(
  { subject, onUpdate }: SubjectGoalPickerProps,
): ReactElement | null {
  const hasThemis = useMe().me?.modules.includes( 'themis' ) ?? false
  const { overview } = useThemisOverview( 'week', hasThemis )

  if( !hasThemis ) {
    return null
  }

  const goals = overview?.areas.flatMap( ( { goals: cards } ) => cards.map( ( { goal } ) => goal ) )
    ?? []
  const current = subject.goal_id ?? ''
  const isListed = current === '' || goals.some( ( { id } ) => id === current )

  return (
    <TextField
      select
      size="small"
      label="Goal"
      value={ current }
      sx={ { maxWidth: '20rem' } }
      onChange={ ( event ) => {
        onUpdate( { goal_id: event.target.value === '' ? null : event.target.value } )
      } }
      slotProps={ { select: { native: true }, inputLabel: { shrink: true } } }
    >
      <option value="">None</option>
      { !isListed && <option value={ current }>Achieved or dropped goal</option> }
      { goals.map( ( { id, name } ) => <option key={ id } value={ id }>{ name }</option> ) }
    </TextField>
  )
}
