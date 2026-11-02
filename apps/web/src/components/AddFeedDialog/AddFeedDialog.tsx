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
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { CreateFeedBody, PreviewFeedResponse, PromptProfile } from '@atlas/shared'
// App
import { formatDate } from '#src/formatDate'
import { useFeedPreview } from '#src/hooks/useFeedPreview'
import { FeedFields } from '../FeedFields'

const WRAP_SX = { overflowWrap: 'anywhere' } as const

interface AddFeedDialogProps {
  profiles: PromptProfile[]
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: CreateFeedBody ) => void
  onCancel: () => void
}

const latestLine = ( { latest_item }: PreviewFeedResponse ): string => {
  if( latest_item === null ) {
    return 'No items yet'
  }

  const date = formatDate( latest_item.published_at )

  return `Latest: ${ latest_item.title }${ date === '' ? '' : ` (${ date })` }`
}

export function AddFeedDialog(
  { profiles, isSubmitting, error, onSubmit, onCancel }: AddFeedDialogProps,
): ReactElement {
  const titleId = useId()
  const preview = useFeedPreview()
  const [ url, setUrl ] = useState( '' )
  const [ foundUrl, setFoundUrl ] = useState< string | null >( null )
  const [ nameChoice, setNameChoice ] = useState< string | null >( null )
  const [ profileId, setProfileId ] = useState( '' )
  const [ autoSummarize, setAutoSummarize ] = useState( false )

  const address = url.trim()
  const found = foundUrl === address ? preview.data ?? null : null
  const name = nameChoice ?? found?.title ?? ''
  const shownError = preview.isError ? preview.error.message : error

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()

    if( found === null ) {
      preview.mutate( address, { onSuccess: () => setFoundUrl( address ) } )

      return
    }

    const body: CreateFeedBody = { url: address }

    if( name !== found.title ) {
      body.name = name.trim()
    }

    if( profileId !== '' ) {
      body.profile_id = profileId
    }

    if( autoSummarize ) {
      body.auto_summarize = true
    }

    onSubmit( body )
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
      <DialogTitle id={ titleId }>Add feed</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            autoFocus
            size="small"
            label="Feed or page address"
            placeholder="https://…"
            value={ url }
            onChange={ ( event ) => setUrl( event.target.value ) }
          />
          { found !== null && (
            <>
              <Stack>
                <Typography sx={ { fontWeight: 600 } }>{ found.title }</Typography>
                <Typography variant="body2" color="text.secondary" sx={ WRAP_SX }>
                  { found.feed_url }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  { latestLine( found ) }
                </Typography>
              </Stack>
              <FeedFields
                name={ name }
                profileId={ profileId }
                autoSummarize={ autoSummarize }
                profiles={ profiles }
                onNameChange={ setNameChoice }
                onProfileChange={ setProfileId }
                onAutoSummarizeChange={ setAutoSummarize }
              />
            </>
          ) }
          { shownError !== null && <Alert severity="error">{ shownError }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        { found === null ? (
          <Button
            type="submit"
            variant="contained"
            disabled={ address === '' || preview.isPending }
          >
            { preview.isPending ? 'Looking…' : 'Find feed' }
          </Button>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={ isSubmitting || name.trim() === '' }
          >
            { isSubmitting ? 'Adding…' : 'Add' }
          </Button>
        ) }
      </DialogActions>
    </Dialog>
  )
}
