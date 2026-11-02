// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import { Outlet } from 'react-router'
// App
import { useMe } from '#src/hooks/useMe'
import { ChooseVault } from '../ChooseVault'
import { GatePage } from '../GatePage'
import { NoModules } from '../NoModules'
import { SignIn } from '../SignIn'

// Shows exactly one of: loading, sign in, choose a vault (none yet, or its folder is gone, ADR
// 0070), no modules, or the app (ADR 0068).
export function AuthGate(): ReactElement {
  const { me, isLoading, error } = useMe()

  if( isLoading ) {
    return <GatePage title="Atlas"><p role="status">Loading…</p></GatePage>
  }

  if( error !== null ) {
    return <GatePage title="Atlas"><Alert severity="error">{ error }</Alert></GatePage>
  }

  if( me === null ) {
    return <SignIn />
  }

  if( me.vault_dir === null || me.vault_missing ) {
    return <ChooseVault missingVault={ me.vault_missing ? me.vault_dir : null } />
  }

  if( me.modules.length === 0 ) {
    return <NoModules />
  }

  return <Outlet />
}
