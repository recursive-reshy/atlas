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
import { useDeleteArea, useUpdateArea } from '#src/features/themis/hooks/useGoalMutations'
import { useCreateArea } from '#src/features/themis/hooks/useThemisMutations'

interface AreaDialogProps {
  // null makes a new area
  area: { id: string, name: string } | null
  onClose: () => void
}

// Make an area, or rename or delete one; the server refuses to delete an area with goals
export function AreaDialog( { area, onClose }: AreaDialogProps ): ReactElement {
  const titleId = useId()
  const [ name, setName ] = useState( area?.name ?? '' )
  const create = useCreateArea()
  const update = useUpdateArea()
  const remove = useDeleteArea()
  const trimmed = name.trim()
  const error = area === null ? create.error : update.error ?? remove.error
  const isPending = create.isPending || update.isPending || remove.isPending

  const handleSave = (): void => {
    if( area === null ) {
      create.mutate( { name: trimmed }, { onSuccess: onClose } )
    } else if( trimmed === area.name ) {
      onClose()
    } else {
      update.mutate( { id: area.id, body: { name: trimmed } }, { onSuccess: onClose } )
    }
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>{ area === null ? 'New area' : 'Rename area' }</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            label="Area name"
            value={ name }
            autoFocus
            onChange={ ( event ) => setName( event.target.value ) }
            slotProps={ { htmlInput: { maxLength: 120 } } }
          />
          { error && <Alert severity="error">{ error.message }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        { area !== null && (
          <Button
            color="error"
            disabled={ isPending }
            onClick={ () => remove.mutate( area.id, { onSuccess: onClose } ) }
            sx={ { mr: 'auto', minHeight: 44 } }
          >
            Delete area
          </Button>
        ) }
        <Button onClick={ onClose } sx={ { minHeight: 44 } }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ trimmed === '' || isPending }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          { area === null ? 'Add area' : 'Save' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
