// React
import { useId } from 'react'
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog(
  { open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps,
): ReactElement {
  const titleId = useId()

  return (
    <Dialog open={ open } onClose={ onCancel } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>{ title }</DialogTitle>
      <DialogContent>
        <DialogContentText>{ message }</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button onClick={ onConfirm } variant="contained" autoFocus>{ confirmLabel }</Button>
      </DialogActions>
    </Dialog>
  )
}
