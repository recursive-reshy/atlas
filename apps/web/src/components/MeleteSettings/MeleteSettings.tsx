// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useModels } from '#src/hooks/useModels'
import { useSettings } from '#src/hooks/useSettings'

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

const MASTERY_DAYS_RANGE = { min: 7, max: 90 } as const

// How long a question's memory must last to count as known (ADR 0090); one setting moves every
// number at once
function MasteryDaysField(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const saved = settings?.melete_mastery_days ?? 21
  const [ draft, setDraft ] = useState< string | null >( null )

  const handleBlur = (): void => {
    const days = Number( draft )
    const isValid = draft !== null && draft.trim() !== ''
      && Number.isInteger( days )
      && days >= MASTERY_DAYS_RANGE.min
      && days <= MASTERY_DAYS_RANGE.max

    if( isValid && days !== saved ) {
      updateSettings.mutate( { melete_mastery_days: days } )
    }

    setDraft( null )
  }

  return (
    <TextField
      type="number"
      size="small"
      label="Days until a question counts as known"
      helperText={ `${ MASTERY_DAYS_RANGE.min } to ${ MASTERY_DAYS_RANGE.max }` }
      disabled={ settings === null }
      value={ draft ?? saved }
      onChange={ ( event ) => setDraft( event.target.value ) }
      onBlur={ handleBlur }
      slotProps={ { htmlInput: MASTERY_DAYS_RANGE } }
    />
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
      <MasteryDaysField />
      <Typography role="status" variant="body2" color="text.secondary">
        { updateSettings.isSuccess ? 'Saved' : '' }
      </Typography>
      { updateSettings.isError && (
        <Alert severity="error">{ updateSettings.error?.message ?? 'Could not save' }</Alert>
      ) }
    </Stack>
  )
}
