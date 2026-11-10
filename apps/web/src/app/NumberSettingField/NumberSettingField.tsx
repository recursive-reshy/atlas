// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import TextField from '@mui/material/TextField'
// App
import { useSettings } from '#src/features/settings/hooks/useSettings'

interface NumberSettingFieldProps {
  settingKey: 'melete_mastery_days' | 'melete_session_gap_minutes' | 'melete_final_card_seconds'
  label: string
  min: number
  max: number
}

// A whole-number setting saved when the field loses focus; anything outside the range is dropped
// and the saved number comes back
export function NumberSettingField(
  { settingKey, label, min, max }: NumberSettingFieldProps,
): ReactElement {
  const { settings, updateSettings } = useSettings()
  const saved = settings?.[ settingKey ] ?? ''
  const [ draft, setDraft ] = useState< string | null >( null )

  const handleBlur = (): void => {
    const number = Number( draft )
    const isValid = draft !== null && draft.trim() !== ''
      && Number.isInteger( number )
      && number >= min
      && number <= max

    if( isValid && number !== saved ) {
      updateSettings.mutate( { [ settingKey ]: number } )
    }

    setDraft( null )
  }

  return (
    <TextField
      type="number"
      size="small"
      label={ label }
      helperText={ `${ min } to ${ max }` }
      disabled={ settings === null }
      value={ draft ?? saved }
      onChange={ ( event ) => setDraft( event.target.value ) }
      onBlur={ handleBlur }
      slotProps={ { htmlInput: { min, max } } }
    />
  )
}
