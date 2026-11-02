// React
import { useId, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
// Shared
import type { Feed, PromptProfile, UpdateFeedBody } from '@atlas/shared'
import { FeedFields } from '../FeedFields'

interface EditFeedDialogProps {
  feed: Feed
  profiles: PromptProfile[]
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: UpdateFeedBody ) => void
  onCancel: () => void
}

export function EditFeedDialog(
  { feed, profiles, isSubmitting, error, onSubmit, onCancel }: EditFeedDialogProps,
): ReactElement {
  const titleId = useId()
  // A feed whose profile was deleted is shown, and kept, as using the default profile.
  const startProfile = profiles.some( ( { id } ) => id === feed.profile_id )
    ? feed.profile_id ?? ''
    : ''
  const [ name, setName ] = useState( feed.name )
  const [ profileId, setProfileId ] = useState( startProfile )
  const [ autoSummarize, setAutoSummarize ] = useState( feed.auto_summarize )

  const changes: UpdateFeedBody = {}

  if( name.trim() !== feed.name ) {
    changes.name = name.trim()
  }

  if( profileId !== startProfile ) {
    changes.profile_id = profileId === '' ? null : profileId
  }

  if( autoSummarize !== feed.auto_summarize ) {
    changes.auto_summarize = autoSummarize
  }

  const hasChanges = Object.keys( changes ).length > 0

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()
    onSubmit( changes )
  }

  return (
    <Dialog
      open
      onClose={ onCancel }
      aria-labelledby={ titleId }
      fullWidth
      maxWidth="sm"
      slotProps={ { paper: { component: 'form', onSubmit: handleSubmit } } }
    >
      <DialogTitle id={ titleId }>Edit feed</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <FeedFields
            name={ name }
            profileId={ profileId }
            autoSummarize={ autoSummarize }
            profiles={ profiles }
            onNameChange={ setName }
            onProfileChange={ setProfileId }
            onAutoSummarizeChange={ setAutoSummarize }
          />
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button
          type="submit"
          variant="contained"
          disabled={ isSubmitting || !hasChanges || name.trim() === '' }
        >
          { isSubmitting ? 'Saving…' : 'Save' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
