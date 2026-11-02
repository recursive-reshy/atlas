// React
import { useId, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import type { AdminUser } from '@atlas/shared'

type DeleteUserDialogProps = {
  user: AdminUser
  isSubmitting: boolean
  error: string | null
  onConfirm: ( confirm: string ) => void
  onCancel: () => void
}

export function DeleteUserDialog(
  { user, isSubmitting, error, onConfirm, onCancel }: DeleteUserDialogProps,
): ReactElement {
  const titleId = useId()
  const [ typed, setTyped ] = useState( '' )
  const isMatch = typed === user.email

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()

    if( isMatch ) {
      onConfirm( typed )
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
      <DialogTitle id={ titleId }>{ `Delete ${ user.name }?` }</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <DialogContentText>
            This deletes the user and all their data from Mnemosyne. It can't be undone. Their
            vault folder is not touched.
          </DialogContentText>
          <TextField
            autoFocus
            size="small"
            label={ `Type ${ user.email } to confirm` }
            value={ typed }
            onChange={ ( event ) => setTyped( event.target.value ) }
          />
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button
          type="submit"
          color="error"
          variant="contained"
          disabled={ !isMatch || isSubmitting }
        >
          Delete user
        </Button>
      </DialogActions>
    </Dialog>
  )
}
