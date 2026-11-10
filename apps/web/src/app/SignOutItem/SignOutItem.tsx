// React
import type { ReactElement } from 'react'
// Packages
import SignOutIcon from '@mui/icons-material/Logout'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
// App
import { useSignOut } from '../useSignOut'

type SignOutItemProps = {
  isMini: boolean
}

export function SignOutItem( { isMini }: SignOutItemProps ): ReactElement {
  const signOut = useSignOut()

  return (
    <ListItem disablePadding>
      <Tooltip title={ isMini ? 'Sign out' : '' } placement="right">
        <ListItemButton
          aria-label="Sign out"
          onClick={ () => signOut.mutate() }
          sx={ { minHeight: 48, px: 2.5 } }
        >
          <ListItemIcon sx={ { minWidth: 0, mr: isMini ? 0 : 2 } }>
            <SignOutIcon />
          </ListItemIcon>
          { !isMini && <ListItemText primary="Sign out" /> }
        </ListItemButton>
      </Tooltip>
    </ListItem>
  )
}
