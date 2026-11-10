// React
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import { useCreateArea } from '#src/features/themis/hooks/useThemisMutations'

export function AddAreaForm(): ReactElement {
  const [ name, setName ] = useState( '' )
  const createArea = useCreateArea()
  const trimmed = name.trim()

  const handleSubmit = ( event: FormEvent ): void => {
    event.preventDefault()

    if( trimmed !== '' ) {
      createArea.mutate( { name: trimmed }, { onSuccess: () => setName( '' ) } )
    }
  }

  return (
    <Stack component="form" spacing={ 1.5 } onSubmit={ handleSubmit }>
      <TextField
        label="Area name"
        value={ name }
        onChange={ ( event ) => setName( event.target.value ) }
        slotProps={ { htmlInput: { maxLength: 120 } } }
      />
      { createArea.error && <Alert severity="error">{ createArea.error.message }</Alert> }
      <Button
        type="submit"
        variant="contained"
        disabled={ trimmed === '' || createArea.isPending }
        sx={ { minHeight: 44, alignSelf: 'flex-start' } }
      >
        Add area
      </Button>
    </Stack>
  )
}
