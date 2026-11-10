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
import type { GmailSource, PromptProfile, UpdateGmailSourceBody } from '@atlas/shared'
// App
import { fromMatch, matchKey, toMatch } from '#src/features/gmail/gmailMatch'
import type { MatchDraft } from '#src/features/gmail/gmailMatch'
import { useGmailLabels } from '#src/features/gmail/hooks/useGmailLabels'
import { usePreviewGmailSource } from '#src/features/gmail/hooks/usePreviewGmailSource'
import { GmailMatchFields } from '../GmailMatchFields'
import { GmailNewsletterFields } from '../GmailNewsletterFields'
import { GmailPreviewSummary } from '../GmailPreviewSummary'

const DESTINATION_LABELS: Record< GmailSource[ 'destination' ], string > = {
  newsletter: 'Newsletter',
  jobs: 'Freelance jobs',
}

interface EditGmailSourceDialogProps {
  source: GmailSource
  profiles: PromptProfile[]
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: UpdateGmailSourceBody ) => void
  onCancel: () => void
}

export function EditGmailSourceDialog(
  { source, profiles, isSubmitting, error, onSubmit, onCancel }: EditGmailSourceDialogProps,
): ReactElement {
  const titleId = useId()
  const preview = usePreviewGmailSource()
  const { labels, isLoading: labelsLoading, error: labelsError } = useGmailLabels( {
    enabled: true,
  } )
  // A source whose profile was deleted is shown, and kept, as using the default profile.
  const startProfile = profiles.some( ( { id } ) => id === source.profile_id )
    ? source.profile_id ?? ''
    : ''
  const [ name, setName ] = useState( source.name )
  const [ draft, setDraft ] = useState< MatchDraft >( fromMatch( source.match ) )
  const [ profileId, setProfileId ] = useState( startProfile )
  const [ autoSummarize, setAutoSummarize ] = useState( source.auto_summarize )
  const [ previewedKey, setPreviewedKey ] = useState< string | null >( null )

  const match = toMatch( draft )
  const key = matchKey( match )
  const matchChanged = key !== matchKey( source.match )
  const found = previewedKey === key ? preview.data ?? null : null
  const shownError = preview.isError ? preview.error.message : error

  const changes: UpdateGmailSourceBody = {}

  if( name.trim() !== source.name ) {
    changes.name = name.trim()
  }

  if( matchChanged && match !== null ) {
    changes.match = match
  }

  if( source.destination === 'newsletter' ) {
    if( profileId !== startProfile ) {
      changes.profile_id = profileId === '' ? null : profileId
    }

    if( autoSummarize !== source.auto_summarize ) {
      changes.auto_summarize = autoSummarize
    }
  }

  const hasChanges = Object.keys( changes ).length > 0
  // A new match is saved only once the person has seen what it finds.
  const canSave = hasChanges && name.trim() !== '' && ( !matchChanged || found !== null )

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

    if( canSave ) {
      onSubmit( changes )
    }
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
      <DialogTitle id={ titleId }>Edit Gmail source</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            size="small"
            label="Name"
            value={ name }
            onChange={ ( event ) => setName( event.target.value ) }
          />
          <Typography variant="body2" color="text.secondary">
            { `Destination: ${ DESTINATION_LABELS[ source.destination ] }` }
          </Typography>
          <GmailMatchFields
            draft={ draft }
            labels={ labels }
            labelsLoading={ labelsLoading }
            labelsError={ labelsError }
            onChange={ handleDraft }
          />
          { matchChanged && (
            <Button
              variant="outlined"
              disabled={ match === null || preview.isPending }
              onClick={ runPreview }
              sx={ { alignSelf: 'flex-start' } }
            >
              { preview.isPending ? 'Previewing…' : 'Preview' }
            </Button>
          ) }
          { found !== null && (
            <GmailPreviewSummary preview={ found } ignoreSourceId={ source.id } />
          ) }
          { source.destination === 'newsletter' && (
            <GmailNewsletterFields
              profileId={ profileId }
              autoSummarize={ autoSummarize }
              profiles={ profiles }
              onProfileChange={ setProfileId }
              onAutoSummarizeChange={ setAutoSummarize }
            />
          ) }
          { shownError !== null && <Alert severity="error">{ shownError }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button type="submit" variant="contained" disabled={ isSubmitting || !canSave }>
          { isSubmitting ? 'Saving…' : 'Save' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
