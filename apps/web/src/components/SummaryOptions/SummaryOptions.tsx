// React
import type { ReactElement } from 'react'
// Packages
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import type { ModelOption, PromptProfile } from '@atlas/shared'

export interface SummaryOptionsProps {
  profiles: PromptProfile[]
  models: ModelOption[]
  profileId: string
  model: string
  isLoading: boolean
  onProfileChange: ( profileId: string ) => void
  onModelChange: ( model: string ) => void
}

// An empty value reads "Default" while the lists are still loading.
const selectProps = (
  options: { id: string, label: string }[],
): { displayEmpty: true, renderValue: ( value: unknown ) => string } => ( {
  displayEmpty: true,
  renderValue: ( value ) => options.find( ( { id } ) => id === value )?.label ?? 'Default',
} )

export function SummaryOptions(
  { profiles, models, profileId, model, isLoading, onProfileChange, onModelChange }:
  SummaryOptionsProps,
): ReactElement {
  const modelOptions = model !== '' && !models.some( ( { id } ) => id === model )
    ? [ ...models, { id: model, display_name: model } ]
    : models

  return (
    <Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 1 }>
      <TextField
        select
        size="small"
        label="Prompt profile"
        value={ profiles.some( ( { id } ) => id === profileId ) ? profileId : '' }
        onChange={ ( event ) => onProfileChange( event.target.value ) }
        disabled={ isLoading }
        slotProps={ {
          select: selectProps( profiles.map( ( { id, name } ) => ( { id, label: name } ) ) ),
          inputLabel: { shrink: true },
        } }
        sx={ { flex: 1 } }
      >
        { profiles.map( ( { id, name } ) => (
          <MenuItem key={ id } value={ id }>{ name }</MenuItem>
        ) ) }
      </TextField>
      <TextField
        select
        size="small"
        label="Model"
        value={ modelOptions.some( ( { id } ) => id === model ) ? model : '' }
        onChange={ ( event ) => onModelChange( event.target.value ) }
        disabled={ isLoading }
        slotProps={ {
          select: selectProps(
            modelOptions.map( ( { id, display_name } ) => ( { id, label: display_name } ) ),
          ),
          inputLabel: { shrink: true },
        } }
        sx={ { flex: 1 } }
      >
        { modelOptions.map( ( { id, display_name } ) => (
          <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
        ) ) }
      </TextField>
    </Stack>
  )
}
