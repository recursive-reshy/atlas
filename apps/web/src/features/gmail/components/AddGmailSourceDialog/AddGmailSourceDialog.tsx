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
// Shared
import type {
  Backfill,
  CreateGmailSourceBody,
  PromptProfile,
} from '@atlas/shared'
// App
import { matchKey, toMatch } from '#src/features/gmail/gmailMatch'
import type { MatchDraft } from '#src/features/gmail/gmailMatch'
import { useGmailLabels } from '#src/features/gmail/hooks/useGmailLabels'
import { usePreviewGmailSource } from '#src/features/gmail/hooks/usePreviewGmailSource'
import { GmailMatchFields } from '../GmailMatchFields'
import { GmailNewsletterFields } from '../GmailNewsletterFields'
import { GmailPreviewSummary } from '../GmailPreviewSummary'
import { intakeLine } from './intakeLine'
import { toCreateBody } from './toCreateBody'

// Job-alert sources are deferred (ADR 0041): every source created here is a newsletter.
const DESTINATION = 'newsletter'

interface AddGmailSourceDialogProps {
  profiles: PromptProfile[]
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: CreateGmailSourceBody ) => void
  onCancel: () => void
}

export function AddGmailSourceDialog(
  { profiles, isSubmitting, error, onSubmit, onCancel }: AddGmailSourceDialogProps,
): ReactElement {
  const titleId = useId()
  const preview = usePreviewGmailSource()
  const { labels, isLoading: labelsLoading, error: labelsError } = useGmailLabels( {
    enabled: true,
  } )
  const [ name, setName ] = useState( '' )
  const [ draft, setDraft ] = useState< MatchDraft >( { kind: 'labels', labelIds: [], query: '' } )
  const [ profileId, setProfileId ] = useState( '' )
  const [ autoSummarize, setAutoSummarize ] = useState( false )
  const [ backfill, setBackfill ] = useState< Backfill >( '30d' )
  const [ previewedKey, setPreviewedKey ] = useState< string | null >( null )

  const match = toMatch( draft )
  const key = matchKey( match )
  const found = previewedKey === key ? preview.data ?? null : null
  const shownError = preview.isError ? preview.error.message : error

  // A preview describes one match; any other needs a new one.
  const handleDraft = ( next: MatchDraft ): void => {
    setDraft( next )
    preview.reset()
  }

  const runPreview = (): void => {
    if( match !== null ) {
      preview.mutate( match, { onSuccess: () => setPreviewedKey( key ) } )
    }
  }

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()

    if( found === null ) {
      runPreview()

      return
    }

    if( match === null || name.trim() === '' ) {
      return
    }

    onSubmit( toCreateBody(
      { name: name.trim(), match, destination: DESTINATION },
      { profileId, autoSummarize, backfill },
    ) )
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
      <DialogTitle id={ titleId }>Add Gmail source</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            autoFocus
            size="small"
            label="Name"
            value={ name }
            onChange={ ( event ) => setName( event.target.value ) }
          />
          <GmailMatchFields
            draft={ draft }
            labels={ labels }
            labelsLoading={ labelsLoading }
            labelsError={ labelsError }
            onChange={ handleDraft }
          />
          <GmailNewsletterFields
            profileId={ profileId }
            autoSummarize={ autoSummarize }
            profiles={ profiles }
            backfill={ backfill }
            onProfileChange={ setProfileId }
            onAutoSummarizeChange={ setAutoSummarize }
            onBackfillChange={ setBackfill }
          />
          { found !== null && (
            <GmailPreviewSummary preview={ found } intake={ intakeLine( DESTINATION, backfill ) } />
          ) }
          { shownError !== null && <Alert severity="error">{ shownError }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button
          variant="outlined"
          disabled={ match === null || preview.isPending }
          onClick={ runPreview }
        >
          { preview.isPending ? 'Previewing…' : 'Preview' }
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={ found === null || isSubmitting || name.trim() === '' }
        >
          { isSubmitting ? 'Adding…' : 'Add' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
