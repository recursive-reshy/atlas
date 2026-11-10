// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { AdminUser, UpdateUserBody } from '@atlas/shared'
// App
import { useAdminUsers } from '#src/features/admin/hooks/useAdminUsers'
import { AddUserDialog } from '../AddUserDialog'
import { ConfirmDialog } from '#src/app/ConfirmDialog'
import { DeleteUserDialog } from '../DeleteUserDialog'
import { UsageSection } from '../UsageSection'
import { UserCard } from '../UserCard'

type Dialog =
  | { kind: 'add' }
  | { kind: 'reset', user: AdminUser }
  | { kind: 'delete', user: AdminUser }

export function AdminTab(): ReactElement {
  const admin = useAdminUsers()
  const [ dialog, setDialog ] = useState< Dialog | null >( null )
  const close = (): void => setDialog( null )
  // Add and delete show their error inside the dialog; the rest show it here.
  const failure = [ admin.updateUser, admin.resetVault ].find( ( { isError } ) => isError )?.error

  const update = ( id: string, body: UpdateUserBody ): void => {
    admin.updateUser.mutate( { id, body } )
  }

  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '64rem' } }>
      <Stack direction="row" sx={ { alignItems: 'center', justifyContent: 'space-between' } }>
        <Typography variant="h6" component="h3">Users</Typography>
        <Button variant="contained" onClick={ () => setDialog( { kind: 'add' } ) }>Add user</Button>
      </Stack>
      { failure && <Alert severity="error">{ failure.message }</Alert> }
      { admin.isLoading && <Typography role="status">Loading users…</Typography> }
      { admin.error !== null && <Alert severity="error">{ admin.error }</Alert> }
      <Stack component="ul" spacing={ 1 } sx={ { m: 0, p: 0 } }>
        { admin.users.map( ( user ) => (
          <UserCard
            key={ user.id }
            user={ user }
            onModulesChange={ ( modules ) => update( user.id, { modules } ) }
            onRemove={ () => update( user.id, { status: 'removed' } ) }
            onRestore={ () => update( user.id, { status: 'active' } ) }
            onResetVault={ () => setDialog( { kind: 'reset', user } ) }
            onDelete={ () => setDialog( { kind: 'delete', user } ) }
          />
        ) ) }
      </Stack>
      <UsageSection users={ admin.users } />
      { dialog?.kind === 'add' && (
        <AddUserDialog
          isSubmitting={ admin.createUser.isPending }
          error={ admin.createUser.error?.message ?? null }
          onSubmit={ ( body ) => admin.createUser.mutate( body, { onSuccess: close } ) }
          onCancel={ () => {
            admin.createUser.reset()
            close()
          } }
        />
      ) }
      { dialog?.kind === 'reset' && (
        <ConfirmDialog
          open
          title={ `Reset ${ dialog.user.name }'s vault?` }
          message={ `${ dialog.user.name } will be asked to choose their vault again. `
            + 'Nothing in the vault or their data is deleted.' }
          confirmLabel="Reset vault"
          onConfirm={ () => {
            admin.resetVault.mutate( dialog.user.id )
            close()
          } }
          onCancel={ close }
        />
      ) }
      { dialog?.kind === 'delete' && (
        <DeleteUserDialog
          user={ dialog.user }
          isSubmitting={ admin.deleteUser.isPending }
          error={ admin.deleteUser.error?.message ?? null }
          onConfirm={ ( confirm ) => admin.deleteUser.mutate(
            { id: dialog.user.id, confirm },
            { onSuccess: close },
          ) }
          onCancel={ () => {
            admin.deleteUser.reset()
            close()
          } }
        />
      ) }
    </Stack>
  )
}
