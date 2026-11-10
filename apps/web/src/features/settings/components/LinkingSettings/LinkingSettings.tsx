// React
import type { ChangeEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { useSettings } from '#src/features/settings/hooks/useSettings'

export function LinkingSettings(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const { models, source, isLoading: isLoadingModels } = useModels()
  const modelId = settings?.linking_model ?? ''
  const isListed = models.some( ( { id } ) => id === modelId )
  const options = modelId !== '' && !isListed && !isLoadingModels
    ? [ ...models, { id: modelId, display_name: modelId } ]
    : models

  const handleSwitch = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { linking_enabled: event.target.checked } )
  }

  const handleModel = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { linking_model: event.target.value } )
  }

  return (
    <Stack spacing={ 2 }>
      { source === 'fallback' && (
        <Alert severity="info">
          The model list is offline, so only the current linking model is shown.
        </Alert>
      ) }
      <FormControlLabel
        label="Link notes automatically"
        control={ (
          <Switch
            checked={ settings?.linking_enabled ?? false }
            disabled={ settings === null }
            onChange={ handleSwitch }
          />
        ) }
      />
      <TextField
        select
        size="small"
        label="Linking model"
        value={ options.some( ( { id } ) => id === modelId ) ? modelId : '' }
        onChange={ handleModel }
        disabled={ settings === null || isLoadingModels }
      >
        { options.map( ( { id, display_name } ) => (
          <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
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
