// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import { useLogMetric } from '#src/features/themis/hooks/useGoalMutations'

interface MetricUpdateDialogProps {
  goal: { id: string, name: string, unit: string | null }
  onClose: () => void
}

// A new value for a metric goal; every update is kept so the card can show a trend
export function MetricUpdateDialog( { goal, onClose }: MetricUpdateDialogProps ): ReactElement {
  const titleId = useId()
  const [ value, setValue ] = useState( '' )
  const [ note, setNote ] = useState( '' )
  const logMetric = useLogMetric()
  const hasValue = value.trim() !== '' && Number.isFinite( Number( value ) )
  const trimmed = note.trim()

  const handleSave = (): void => {
    logMetric.mutate(
      {
        goalId: goal.id,
        body: { value: Number( value ), ...( trimmed === '' ? {} : { note: trimmed } ) },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>{ `Update ${ goal.name }` }</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            label={ goal.unit === null ? 'Value' : `Value (${ goal.unit })` }
            type="number"
            value={ value }
            autoFocus
            onChange={ ( event ) => setValue( event.target.value ) }
          />
          <TextField
            label="Note (optional)"
            value={ note }
            onChange={ ( event ) => setNote( event.target.value ) }
            slotProps={ { htmlInput: { maxLength: 500 } } }
          />
          { logMetric.error && <Alert severity="error">{ logMetric.error.message }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onClose } sx={ { minHeight: 44 } }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ !hasValue || logMetric.isPending }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          Save update
        </Button>
      </DialogActions>
    </Dialog>
  )
}
