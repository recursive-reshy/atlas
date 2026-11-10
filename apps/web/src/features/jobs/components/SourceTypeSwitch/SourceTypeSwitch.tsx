// React
import type { ReactElement } from 'react'
// Packages
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
// Shared
import type { SourceType } from '@atlas/shared'

interface SourceTypeSwitchProps {
  value: SourceType
  onChange: ( value: SourceType ) => void
  disabled?: boolean
}

export function SourceTypeSwitch(
  { value, onChange, disabled = false }: SourceTypeSwitchProps,
): ReactElement {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      aria-label="Source type"
      value={ value }
      disabled={ disabled }
      onChange={ ( _event, next: SourceType | null ) => {
        if( next !== null ) {
          onChange( next )
        }
      } }
      sx={ { alignSelf: 'flex-start' } }
    >
      <ToggleButton value="video">Video</ToggleButton>
      <ToggleButton value="article">Article</ToggleButton>
    </ToggleButtonGroup>
  )
}
