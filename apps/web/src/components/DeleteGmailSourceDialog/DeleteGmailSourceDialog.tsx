// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
// Shared
import type { GmailSource } from '@atlas/shared'

interface DeleteGmailSourceDialogProps {
  source: GmailSource
  isDeleting: boolean
  error: string | null
  onConfirm: ( removeInboxItems: boolean ) => void
  onCancel: () => void
}

export function DeleteGmailSourceDialog(
  { source, isDeleting, error, onConfirm, onCancel }: DeleteGmailSourceDialogProps,
): ReactElement {
  const titleId = useId()
  const [ removeItems, setRemoveItems ] = useState( false )
  const count = source.inbox_count
  const noun = count === 1 ? 'item' : 'items'
  const kept = source.destination === 'jobs'
    ? 'Its collected jobs stay.'
    : 'Its notes stay.'

  return (
    <Dialog open onClose={ onCancel } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Delete Gmail source</DialogTitle>
      <DialogContent>
        <Stack spacing={ 1 }>
          <DialogContentText>
            { `Delete "${ source.name }"? It stops being checked. ${ kept }` }
          </DialogContentText>
          { source.destination === 'newsletter' && count > 0 && (
            <FormControlLabel
              label={ `Also remove its ${ count } ${ noun } from the inbox` }
              control={ (
                <Checkbox
                  checked={ removeItems }
                  onChange={ ( event ) => setRemoveItems( event.target.checked ) }
                />
              ) }
            />
          ) }
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          disabled={ isDeleting }
          onClick={ () => onConfirm( removeItems ) }
        >
          { isDeleting ? 'Deleting…' : 'Delete' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
