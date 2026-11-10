// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
// Shared
import { ModuleId } from '@atlas/shared'
import type { AdminUser } from '@atlas/shared'
// App
import { formatDate } from '#src/lib/formatDate'
import { MODULE_LABELS } from '#src/app/moduleLabels'

const CARD_SX = { p: 2, listStyle: 'none' } as const
const WRAP_SX = { overflowWrap: 'anywhere' } as const

type UserCardProps = {
  user: AdminUser
  onModulesChange: ( modules: ModuleId[] ) => void
  onRemove: () => void
  onRestore: () => void
  onResetVault: () => void
  onDelete: () => void
}

export function UserCard(
  { user, onModulesChange, onRemove, onRestore, onResetVault, onDelete }: UserCardProps,
): ReactElement {
  const isAdmin = user.role === 'admin'
  const isRemoved = user.status === 'removed'

  const handleSwitch = ( module: ModuleId, isOn: boolean ): void => {
    // Keep the drawer's order whatever order the switches are flipped in.
    onModulesChange( ModuleId.options.filter(
      ( option ) => option === module ? isOn : user.modules.includes( option ),
    ) )
  }

  return (
    <Paper component="li" variant="outlined" sx={ CARD_SX }>
      <Stack spacing={ 1 }>
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', flexWrap: 'wrap' } }>
          <Typography variant="h6" component="h4">{ user.name }</Typography>
          <Chip size="small" label={ isAdmin ? 'Admin' : 'Member' } />
          <Chip
            size="small"
            color={ isRemoved ? 'warning' : 'default' }
            label={ isRemoved ? 'Removed' : 'Active' }
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={ WRAP_SX }>
          { user.email }
        </Typography>
        <Typography variant="body2" sx={ WRAP_SX }>
          { user.vault_dir === null ? 'No vault yet' : `Vault: ${ user.vault_dir }` }
        </Typography>
        <Typography variant="body2">
          { user.last_signin_at === null
            ? 'Never signed in'
            : `Last sign-in: ${ formatDate( user.last_signin_at ) }` }
        </Typography>
        { isAdmin ? <Typography variant="body2">Every module</Typography> : (
          <FormGroup row>
            { ModuleId.options.map( ( module ) => (
              <FormControlLabel
                key={ module }
                label={ MODULE_LABELS[ module ] }
                control={ (
                  <Switch
                    checked={ user.modules.includes( module ) }
                    onChange={ ( event ) => handleSwitch( module, event.target.checked ) }
                  />
                ) }
              />
            ) ) }
          </FormGroup>
        ) }
        { !isAdmin && (
          <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
            { isRemoved
              ? <Button size="small" variant="outlined" onClick={ onRestore }>Restore</Button>
              : <Button size="small" variant="outlined" onClick={ onRemove }>Remove</Button> }
            { !isRemoved && user.vault_dir !== null && (
              <Button size="small" variant="outlined" onClick={ onResetVault }>Reset vault</Button>
            ) }
            { isRemoved && (
              <Button size="small" color="error" variant="outlined" onClick={ onDelete }>
                Delete user
              </Button>
            ) }
          </Stack>
        ) }
      </Stack>
    </Paper>
  )
}
