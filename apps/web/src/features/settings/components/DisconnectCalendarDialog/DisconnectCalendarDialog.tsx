// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'

interface DisconnectCalendarDialogProps {
  open: boolean
  onConfirm: ( removeTime: boolean ) => void
  onCancel: () => void
}

const MESSAGE = 'Atlas will revoke its access and forget the stored credentials. Time you '
  + 'approved from the calendar stays, unless you choose to remove it.'

export function DisconnectCalendarDialog(
  { open, onConfirm, onCancel }: DisconnectCalendarDialogProps,
): ReactElement {
  const titleId = useId()
  const [ removeTime, setRemoveTime ] = useState( false )

  const finish = ( confirmed: boolean ): void => {
    const remove = removeTime

    setRemoveTime( false )

    if( confirmed ) {
      onConfirm( remove )
    } else {
      onCancel()
    }
  }

  return (
    <Dialog open={ open } onClose={ () => finish( false ) } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Disconnect Google Calendar?</DialogTitle>
      <DialogContent>
        <DialogContentText>{ MESSAGE }</DialogContentText>
        <FormControlLabel
          label="Also remove imported time"
          control={ (
            <Checkbox
              checked={ removeTime }
              onChange={ ( event ) => setRemoveTime( event.target.checked ) }
            />
          ) }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={ () => finish( false ) }>Cancel</Button>
        <Button onClick={ () => finish( true ) } variant="contained" autoFocus>
          Disconnect Calendar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
