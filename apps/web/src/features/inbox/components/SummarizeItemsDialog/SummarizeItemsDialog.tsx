// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import type { SummarizeInboxBody } from '@atlas/shared'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'

type Choices = Omit< SummarizeInboxBody, 'items' >

interface SummarizeItemsDialogProps {
  count: number
  isSubmitting: boolean
  error: string | null
  onSubmit: ( choices: Choices ) => void
  onCancel: () => void
}

const EACH_FEEDS_PROFILE = 'Each feed\'s profile'
const SHRUNK_LABEL = { inputLabel: { shrink: true } } as const

export function SummarizeItemsDialog(
  { count, isSubmitting, error, onSubmit, onCancel }: SummarizeItemsDialogProps,
): ReactElement {
  const titleId = useId()
  const { settings } = useSettings()
  const { models, isLoading: isLoadingModels } = useModels()
  const { profiles } = usePromptProfiles()
  // An empty profile id leaves each item with its own feed's profile.
  const [ profileId, setProfileId ] = useState( '' )
  const [ modelChoice, setModelChoice ] = useState< string | null >( null )

  const defaultModel = settings?.default_model ?? ''
  const model = modelChoice ?? defaultModel
  const modelOptions = model !== '' && !models.some( ( { id } ) => id === model )
    ? [ ...models, { id: model, display_name: model } ]
    : models

  const handleSubmit = (): void => {
    const choices: Choices = {}

    if( profileId !== '' ) {
      choices.profile_id = profileId
    }

    if( model !== defaultModel ) {
      choices.model = model
    }

    onSubmit( choices )
  }

  return (
    <Dialog open onClose={ onCancel } aria-labelledby={ titleId } fullWidth maxWidth="sm">
      <DialogTitle id={ titleId }>Summarize items</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <DialogContentText>
            { count === 1 ? '1 item will become a job.' : `${ count } items will become jobs.` }
          </DialogContentText>
          <TextField
            select
            size="small"
            label="Prompt profile"
            value={ profileId }
            onChange={ ( event ) => setProfileId( event.target.value ) }
            slotProps={ { ...SHRUNK_LABEL, select: { displayEmpty: true } } }
          >
            <MenuItem value="">{ EACH_FEEDS_PROFILE }</MenuItem>
            { profiles.map( ( { id, name } ) => (
              <MenuItem key={ id } value={ id }>{ name }</MenuItem>
            ) ) }
          </TextField>
          <TextField
            select
            size="small"
            label="Model"
            value={ modelOptions.some( ( { id } ) => id === model ) ? model : '' }
            onChange={ ( event ) => setModelChoice( event.target.value ) }
            disabled={ settings === null || isLoadingModels }
            slotProps={ SHRUNK_LABEL }
          >
            { modelOptions.map( ( { id, display_name } ) => (
              <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
            ) ) }
          </TextField>
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button variant="contained" onClick={ handleSubmit } disabled={ isSubmitting }>
          { isSubmitting ? 'Summarizing…' : 'Summarize' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
