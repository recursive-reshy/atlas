// React
import { useId, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import { CreateUserBody, ModuleId } from '@atlas/shared'
// App
import { MODULE_LABELS } from '#src/app/moduleLabels'

type AddUserDialogProps = {
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: CreateUserBody ) => void
  onCancel: () => void
}

export function AddUserDialog(
  { isSubmitting, error, onSubmit, onCancel }: AddUserDialogProps,
): ReactElement {
  const titleId = useId()
  const [ email, setEmail ] = useState( '' )
  const [ name, setName ] = useState( '' )
  const [ modules, setModules ] = useState< ModuleId[] >( [] )
  const [ hasTried, setHasTried ] = useState( false )
  const parsed = CreateUserBody.safeParse( { email: email.trim(), name: name.trim(), modules } )
  const invalidFields = parsed.success ? [] : parsed.error.issues.map( ( { path } ) => path[ 0 ] )
  const isEmailInvalid = hasTried && invalidFields.includes( 'email' )
  const isNameInvalid = hasTried && invalidFields.includes( 'name' )

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()
    setHasTried( true )

    if( parsed.success ) {
      onSubmit( parsed.data )
    }
  }

  const handleModule = ( module: ModuleId, isOn: boolean ): void => {
    setModules( ModuleId.options.filter(
      ( option ) => option === module ? isOn : modules.includes( option ),
    ) )
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
      <DialogTitle id={ titleId }>Add user</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 } sx={ { pt: 1 } }>
          <TextField
            autoFocus
            size="small"
            label="Google email"
            value={ email }
            onChange={ ( event ) => setEmail( event.target.value ) }
            error={ isEmailInvalid }
            helperText={ isEmailInvalid ? 'Enter a valid email' : '' }
          />
          <TextField
            size="small"
            label="Name"
            value={ name }
            onChange={ ( event ) => setName( event.target.value ) }
            error={ isNameInvalid }
            helperText={ isNameInvalid ? 'Enter a name' : '' }
          />
          <FormGroup>
            { ModuleId.options.map( ( module ) => (
              <FormControlLabel
                key={ module }
                label={ MODULE_LABELS[ module ] }
                control={ (
                  <Checkbox
                    checked={ modules.includes( module ) }
                    onChange={ ( event ) => handleModule( module, event.target.checked ) }
                  />
                ) }
              />
            ) ) }
            <FormHelperText>A user with no modules sees a page saying so.</FormHelperText>
          </FormGroup>
          { error !== null && <Alert severity="error">{ error }</Alert> }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onCancel }>Cancel</Button>
        <Button type="submit" variant="contained" disabled={ isSubmitting }>
          { isSubmitting ? 'Adding…' : 'Add user' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}
