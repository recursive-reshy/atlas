// React
import type { ChangeEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'

export function SummarizerDefaults(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const { models, source, isLoading: isLoadingModels } = useModels()
  const { profiles, isLoading: isLoadingProfiles } = usePromptProfiles()

  const isDisabled = settings === null || isLoadingModels || isLoadingProfiles
  const modelId = settings?.default_model ?? ''
  const isModelListed = models.some( ( { id } ) => id === modelId )
  const options = modelId !== '' && !isModelListed && !isLoadingModels
    ? [ ...models, { id: modelId, display_name: modelId } ]
    : models

  const handleModel = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { default_model: event.target.value } )
  }

  const handleProfile = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { default_profile_id: event.target.value } )
  }

  return (
    <Stack spacing={ 2 }>
      { source === 'fallback' && (
        <Alert severity="info">
          The model list is offline, so only the current default model is shown.
        </Alert>
      ) }
      <TextField
        select
        size="small"
        label="Default model"
        value={ options.some( ( { id } ) => id === modelId ) ? modelId : '' }
        onChange={ handleModel }
        disabled={ isDisabled }
      >
        { options.map( ( { id, display_name } ) => (
          <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
        ) ) }
      </TextField>
      <TextField
        select
        size="small"
        label="Default prompt profile"
        value={ isDisabled ? '' : settings.default_profile_id }
        onChange={ handleProfile }
        disabled={ isDisabled }
      >
        { profiles.map( ( { id, name } ) => (
          <MenuItem key={ id } value={ id }>{ name }</MenuItem>
        ) ) }
      </TextField>
      <Typography role="status" variant="body2" color="text.secondary">
        { updateSettings.isSuccess ? 'Saved' : '' }
      </Typography>
      { updateSettings.isError && (
        <Alert severity="error">{ updateSettings.error?.message ?? 'Could not save' }</Alert>
      ) }
    </Stack>
  )
}
