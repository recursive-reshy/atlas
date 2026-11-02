// React
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import { VaultDir } from '@atlas/shared'
// App
import { useSignOut } from '#src/hooks/useSignOut'
import { useVaultChoices } from '#src/hooks/useVaultChoices'
import { GatePage } from '../GatePage'

const NAME_RULE = '1 to 40 characters: lowercase letters, digits and hyphens, '
  + 'not starting or ending with a hyphen.'

const TAP_SX = { minHeight: 44 } as const

interface ChooseVaultProps {
  // The folder the user chose before, when it has since gone
  missingVault?: string | null
}

export function ChooseVault( { missingVault = null }: ChooseVaultProps ): ReactElement {
  const {
    folders,
    canCreate,
    isLoading,
    error,
    claim,
    create,
  } = useVaultChoices()
  const signOut = useSignOut()
  const [ selected, setSelected ] = useState( '' )
  const [ name, setName ] = useState( '' )
  const [ isNameInvalid, setIsNameInvalid ] = useState( false )
  const failure = claim.error ?? create.error ?? null

  const handleCreate = ( event: FormEvent ): void => {
    event.preventDefault()
    const parsed = VaultDir.safeParse( name )

    setIsNameInvalid( !parsed.success )

    if( parsed.success ) {
      create.mutate( parsed.data )
    }
  }

  return (
    <GatePage title="Choose your vault">
      <Typography color="text.secondary">
        Your vault is the folder that holds your notes.
        { canCreate
          ? ' Pick one nobody has claimed, or make a new one.'
          : ' Pick the one the admin set up for you.' }
      </Typography>
      { missingVault !== null && (
        <Alert severity="warning" sx={ { wordBreak: 'break-all' } }>
          Your vault folder { missingVault } is missing.
          { canCreate ? ' Pick another folder, or create a new one.' : ' Pick another folder.' }
        </Alert>
      ) }
      { failure !== null && <Alert severity="error">{ failure.message }</Alert> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { isLoading && <Typography role="status">Loading vaults…</Typography> }
      { folders.length > 0 && (
        <FormControl>
          <FormLabel id="vault-choice-label">Existing folders</FormLabel>
          <RadioGroup
            aria-labelledby="vault-choice-label"
            value={ selected }
            onChange={ ( event ) => setSelected( event.target.value ) }
          >
            { folders.map( ( folder ) => (
              <FormControlLabel
                key={ folder }
                value={ folder }
                control={ <Radio /> }
                label={ folder }
                sx={ { ...TAP_SX, wordBreak: 'break-all' } }
              />
            ) ) }
          </RadioGroup>
          <Button
            variant="contained"
            disabled={ selected === '' || claim.isPending }
            onClick={ () => claim.mutate( selected ) }
            sx={ { ...TAP_SX, mt: 1 } }
          >
            Use this vault
          </Button>
        </FormControl>
      ) }
      { canCreate ? (
        <>
          { folders.length > 0 && <Divider /> }
          <Stack component="form" spacing={ 1 } onSubmit={ handleCreate } noValidate>
            <TextField
              label="New vault name"
              value={ name }
              onChange={ ( event ) => setName( event.target.value ) }
              error={ isNameInvalid }
              helperText={ NAME_RULE }
              slotProps={ { htmlInput: { autoCapitalize: 'none', spellCheck: false } } }
            />
            <Button type="submit" variant="outlined" disabled={ create.isPending } sx={ TAP_SX }>
              Create vault
            </Button>
          </Stack>
        </>
      ) : (
        <Typography color="text.secondary">
          If your vault isn&apos;t listed, ask the admin to set up its sync.
        </Typography>
      ) }
      <Button onClick={ () => signOut.mutate() } sx={ { ...TAP_SX, alignSelf: 'flex-start' } }>
        Sign out
      </Button>
    </GatePage>
  )
}
