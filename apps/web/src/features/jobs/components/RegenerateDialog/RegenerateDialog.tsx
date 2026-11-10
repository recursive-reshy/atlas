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
import Stack from '@mui/material/Stack'
// Shared
import type { Job, RegenerateSummaryBody } from '@atlas/shared'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { SummaryOptions } from '../SummaryOptions'

interface RegenerateDialogProps {
  job: Job
  isSubmitting: boolean
  error: string | null
  onSubmit: ( choices: RegenerateSummaryBody ) => void
  onCancel: () => void
}

export function RegenerateDialog(
  { job, isSubmitting, error, onSubmit, onCancel }: RegenerateDialogProps,
): ReactElement {
  const titleId = useId()
  const { settings } = useSettings()
  const { models, isLoading: isLoadingModels } = useModels()
  const { profiles, isLoading: isLoadingProfiles } = usePromptProfiles()
  const [ profileChoice, setProfileChoice ] = useState< string | null >( null )
  const [ modelChoice, setModelChoice ] = useState< string | null >( null )

  const isProfileActive = profiles.some( ( { id } ) => id === job.prompt_profile_id )
  const startProfile = ( isProfileActive ? job.prompt_profile_id : null )
    ?? settings?.default_profile_id ?? ''
  const startModel = job.summary_model ?? settings?.default_model ?? ''
  const profileId = profileChoice ?? startProfile
  const model = modelChoice ?? startModel

  const handleSubmit = (): void => {
    const choices: RegenerateSummaryBody = {}

    if( model !== startModel ) {
      choices.model = model
    }

    if( profileId !== startProfile ) {
      choices.profile_id = profileId
    }

    onSubmit( choices )
  }

  return (
    <Dialog open onClose={ onCancel } aria-labelledby={ titleId } fullWidth maxWidth="sm">
      <DialogTitle id={ titleId }>Regenerate summary</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <DialogContentText>
            Regenerating replaces the current note, including any edits you made. The vault
            folder you chose is kept.
          </DialogContentText>
          <SummaryOptions
            profiles={ profiles }
            models={ models }
            profileId={ profileId }
            model={ model }
            isLoading={ settings === null || isLoadingModels || isLoadingProfiles }
            onProfileChange={ setProfileChoice }
            onModelChange={ setModelChoice }
          />
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button variant="contained" onClick={ handleSubmit } disabled={ isSubmitting }>
          { isSubmitting ? 'Regenerating…' : 'Regenerate' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
