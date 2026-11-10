// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { NumberSettingField } from '#src/app/NumberSettingField'

interface ModelSelectProps {
  label: string
  settingKey:
    | 'melete_question_model'
    | 'melete_grading_model'
    | 'melete_syllabus_model'
    | 'melete_map_model'
    | 'melete_suggest_model'
}

function ModelSelect( { label, settingKey }: ModelSelectProps ): ReactElement {
  const { settings, updateSettings } = useSettings()
  const { models, isLoading } = useModels()
  const modelId = settings?.[ settingKey ] ?? ''
  const isListed = models.some( ( { id } ) => id === modelId )
  // A saved model that has left the list stays selectable, so the field never looks empty.
  const options = modelId !== '' && !isListed && !isLoading
    ? [ ...models, { id: modelId, display_name: modelId } ]
    : models

  return (
    <TextField
      select
      size="small"
      label={ label }
      value={ options.some( ( { id } ) => id === modelId ) ? modelId : '' }
      disabled={ settings === null || isLoading }
      onChange={ ( event ) => {
        updateSettings.mutate( { [ settingKey ]: event.target.value } )
      } }
    >
      { options.map( ( { id, display_name } ) => (
        <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
      ) ) }
    </TextField>
  )
}

export function MeleteSettings(): ReactElement {
  const { updateSettings } = useSettings()
  const { source } = useModels()

  return (
    <Stack spacing={ 2 }>
      { source === 'fallback' && (
        <Alert severity="info">
          The model list is offline, so only the current Melete models are shown.
        </Alert>
      ) }
      <ModelSelect label="Question model" settingKey="melete_question_model" />
      <ModelSelect label="Grading model" settingKey="melete_grading_model" />
      <ModelSelect label="Syllabus model" settingKey="melete_syllabus_model" />
      <ModelSelect label="Mapping model" settingKey="melete_map_model" />
      <ModelSelect label="Suggestion model" settingKey="melete_suggest_model" />
      <NumberSettingField
        settingKey="melete_mastery_days"
        label="Days until a question counts as known"
        min={ 7 }
        max={ 90 }
      />
      <NumberSettingField
        settingKey="melete_session_gap_minutes"
        label="Minutes without an answer that end a session"
        min={ 1 }
        max={ 30 }
      />
      <NumberSettingField
        settingKey="melete_final_card_seconds"
        label="Seconds counted for the last card"
        min={ 0 }
        max={ 120 }
      />
      <Typography role="status" variant="body2" color="text.secondary">
        { updateSettings.isSuccess ? 'Saved' : '' }
      </Typography>
      { updateSettings.isError && (
        <Alert severity="error">{ updateSettings.error?.message ?? 'Could not save' }</Alert>
      ) }
    </Stack>
  )
}
