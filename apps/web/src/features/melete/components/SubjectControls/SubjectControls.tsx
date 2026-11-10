// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
// Shared
import type { MeleteSubject, UpdateMeleteSubjectBody } from '@atlas/shared'

interface SubjectControlsProps {
  subject: MeleteSubject
  onEnrollAll: ( enrolled: boolean ) => void
  onUpdate: ( body: UpdateMeleteSubjectBody ) => void
}

const LIMIT_MESSAGE = 'Enter a whole number from 0 to 100'

const parseLimit = ( text: string ): number | null => {
  const value = Number( text )

  return text.trim() !== '' && Number.isInteger( value ) && value >= 0 && value <= 100
    ? value
    : null
}

export function SubjectControls(
  { subject, onEnrollAll, onUpdate }: SubjectControlsProps,
): ReactElement {
  const [ limit, setLimit ] = useState( String( subject.new_per_day ) )
  const [ hasError, setHasError ] = useState( false )

  const handleBlur = (): void => {
    const value = parseLimit( limit )

    setHasError( value === null )

    if( value !== null && value !== subject.new_per_day ) {
      onUpdate( { new_per_day: value } )
    }
  }

  return (
    <Stack spacing={ 2 }>
      <Stack direction="row" spacing={ 1 }>
        <Button variant="outlined" sx={ { minHeight: 44 } } onClick={ () => onEnrollAll( true ) }>
          Enroll all
        </Button>
        <Button variant="outlined" sx={ { minHeight: 44 } } onClick={ () => onEnrollAll( false ) }>
          Unenroll all
        </Button>
      </Stack>
      <FormControlLabel
        label="Auto-enroll new notes"
        control={ (
          <Switch
            checked={ subject.auto_enroll }
            onChange={ ( event ) => onUpdate( { auto_enroll: event.target.checked } ) }
          />
        ) }
      />
      <TextField
        label="New questions per day"
        type="number"
        size="small"
        value={ limit }
        error={ hasError }
        helperText={ hasError ? LIMIT_MESSAGE : undefined }
        slotProps={ { htmlInput: { min: 0, max: 100, step: 1 } } }
        sx={ { maxWidth: '14rem' } }
        onChange={ ( event ) => setLimit( event.target.value ) }
        onBlur={ handleBlur }
      />
    </Stack>
  )
}
