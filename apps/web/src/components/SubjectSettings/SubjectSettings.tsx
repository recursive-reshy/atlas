// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import type { MeleteSubject, UpdateMeleteSubjectBody } from '@atlas/shared'
import { MeleteTargetLevel } from '@atlas/shared'
// App
import { SubjectControls } from '#src/components/SubjectControls'
import { LEVELS } from '#src/syllabusLevels'

interface SubjectSettingsProps {
  subject: MeleteSubject
  onEnrollAll: ( enrolled: boolean ) => void
  onUpdate: ( body: UpdateMeleteSubjectBody ) => void
}

export function SubjectSettings(
  { subject, onEnrollAll, onUpdate }: SubjectSettingsProps,
): ReactElement {
  const [ intent, setIntent ] = useState( subject.intent ?? '' )

  const handleIntentBlur = (): void => {
    const text = intent.trim()

    if( text !== ( subject.intent ?? '' ) ) {
      onUpdate( { intent: text } )
    }
  }

  return (
    <Stack spacing={ 2 }>
      <SubjectControls subject={ subject } onEnrollAll={ onEnrollAll } onUpdate={ onUpdate } />
      <TextField
        select
        size="small"
        label="Target level"
        value={ subject.target_level ?? '' }
        sx={ { maxWidth: '20rem' } }
        onChange={ ( event ) => {
          onUpdate( { target_level: MeleteTargetLevel.parse( event.target.value ) } )
        } }
      >
        { LEVELS.map( ( { value, label } ) => (
          <MenuItem key={ value } value={ value }>{ label }</MenuItem>
        ) ) }
      </TextField>
      <TextField
        label="Intent"
        helperText="What this subject is for. Used the next time the syllabus is drafted."
        value={ intent }
        multiline
        slotProps={ { htmlInput: { maxLength: 500 } } }
        onChange={ ( event ) => setIntent( event.target.value ) }
        onBlur={ handleIntentBlur }
      />
    </Stack>
  )
}
