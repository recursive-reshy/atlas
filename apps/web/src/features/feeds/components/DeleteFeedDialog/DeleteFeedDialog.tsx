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
import type { Feed } from '@atlas/shared'

interface DeleteFeedDialogProps {
  feed: Feed
  isDeleting: boolean
  error: string | null
  onConfirm: ( removeItems: boolean ) => void
  onCancel: () => void
}

export function DeleteFeedDialog(
  { feed, isDeleting, error, onConfirm, onCancel }: DeleteFeedDialogProps,
): ReactElement {
  const titleId = useId()
  const [ removeItems, setRemoveItems ] = useState( false )
  const count = feed.inbox_count
  const noun = count === 1 ? 'item' : 'items'

  return (
    <Dialog open onClose={ onCancel } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Delete feed</DialogTitle>
      <DialogContent>
        <Stack spacing={ 1 }>
          <DialogContentText>
            { `Delete "${ feed.name }"? It stops being checked. Its jobs and notes stay.` }
          </DialogContentText>
          { count > 0 && (
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
