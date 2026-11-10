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
import { ARTICLE_LIMITS } from '@atlas/shared'
import type { SubmitPastedTextBody } from '@atlas/shared'
// App
import { PastedTextFields } from '../PastedTextFields'

interface PasteTextDialogProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: SubmitPastedTextBody ) => void
  onCancel: () => void
}

export function PasteTextDialog(
  { isSubmitting, error, onSubmit, onCancel }: PasteTextDialogProps,
): ReactElement {
  const titleId = useId()
  const [ text, setText ] = useState( '' )
  const [ title, setTitle ] = useState( '' )
  const length = text.trim().length
  const isValid = length >= ARTICLE_LIMITS.minPastedChars && length <= ARTICLE_LIMITS.maxChars

  const handleSubmit = (): void => {
    const body: SubmitPastedTextBody = { text: text.trim() }

    if( title.trim() !== '' ) {
      body.title = title.trim()
    }

    onSubmit( body )
  }

  return (
    <Dialog open onClose={ onCancel } aria-labelledby={ titleId } fullWidth maxWidth="md">
      <DialogTitle id={ titleId }>Paste the article text</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <DialogContentText>
            Paste the text of the article. The URL stays as the note’s source, and nothing is
            fetched.
          </DialogContentText>
          <PastedTextFields
            text={ text }
            title={ title }
            onTextChange={ setText }
            onTitleChange={ setTitle }
            disabled={ isSubmitting }
          />
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button
          variant="contained"
          onClick={ handleSubmit }
          disabled={ isSubmitting || !isValid }
        >
          { isSubmitting ? 'Summarizing…' : 'Summarize' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
