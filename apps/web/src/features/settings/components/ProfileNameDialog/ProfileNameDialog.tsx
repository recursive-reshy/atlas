// React
import { useId, useState } from 'react'
import type { ReactElement, SyntheticEvent } from 'react'
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
import { Guidance, ProfileName } from '@atlas/shared'

const TEXT = {
  create: { title: 'New profile', action: 'Create' },
  rename: { title: 'Rename profile', action: 'Rename' },
} as const

const GUIDANCE_SX = { '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem' } } as const

interface ProfileNameDialogProps {
  mode: 'create' | 'rename'
  open: boolean
  initialName: string
  initialGuidance: string
  error: string | null
  isSaving: boolean
  onSubmit: ( values: { name: string, guidance?: string } ) => void
  onCancel: () => void
}

export function ProfileNameDialog(
  { mode, open, initialName, initialGuidance, error, isSaving, onSubmit, onCancel }:
  ProfileNameDialogProps,
): ReactElement {
  const titleId = useId()
  const [ name, setName ] = useState( initialName )
  const [ guidance, setGuidance ] = useState( initialGuidance )

  const parsedName = ProfileName.safeParse( name )
  const isCreate = mode === 'create'
  const isChanged = parsedName.success && parsedName.data !== initialName.trim()
  const isValid = parsedName.success
    && ( isCreate ? Guidance.safeParse( guidance ).success : isChanged )

  const handleSubmit = ( event: SyntheticEvent< HTMLFormElement > ): void => {
    event.preventDefault()

    if( !isValid || !parsedName.success ) {
      return
    }

    onSubmit( isCreate ? { name: parsedName.data, guidance } : { name: parsedName.data } )
  }

  return (
    <Dialog open={ open } onClose={ onCancel } aria-labelledby={ titleId } fullWidth maxWidth="sm">
      <form onSubmit={ handleSubmit }>
        <DialogTitle id={ titleId }>{ TEXT[ mode ].title }</DialogTitle>
        <DialogContent>
          <Stack spacing={ 2 } sx={ { pt: 1 } }>
            { error !== null && <Alert severity="error">{ error }</Alert> }
            <TextField
              label="Name"
              value={ name }
              onChange={ ( event ) => setName( event.target.value ) }
              autoFocus
              size="small"
            />
            { isCreate && (
              <TextField
                label="Guidance"
                value={ guidance }
                onChange={ ( event ) => setGuidance( event.target.value ) }
                multiline
                minRows={ 6 }
                maxRows={ 14 }
                sx={ GUIDANCE_SX }
              />
            ) }
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={ onCancel }>Cancel</Button>
          <Button type="submit" variant="contained" disabled={ !isValid || isSaving }>
            { TEXT[ mode ].action }
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
