// React
import type { ReactElement } from 'react'
// Packages
import Badge from '@mui/material/Badge'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import { Link } from 'react-router'

type NavItemProps = {
  label: string
  to: string
  icon: ReactElement
  isSelected: boolean
  isMini: boolean
  onNavigate: ( () => void ) | undefined
  failingCount?: number
}

export function NavItem(
  { label, to, icon, isSelected, isMini, onNavigate, failingCount = 0 }: NavItemProps,
): ReactElement {
  const name = failingCount === 0 ? label : `${ label }, ${ failingCount } failing`

  return (
    <ListItem disablePadding>
      <Tooltip title={ isMini ? name : '' } placement="right">
        <ListItemButton
          component={ Link }
          to={ to }
          selected={ isSelected }
          aria-current={ isSelected ? 'page' : undefined }
          { ...( failingCount === 0 ? {} : { 'aria-label': name } ) }
          onClick={ onNavigate }
          sx={ { minHeight: 48, px: 2.5 } }
        >
          <ListItemIcon sx={ { minWidth: 0, mr: isMini ? 0 : 2 } }>
            <Badge badgeContent={ failingCount } color="warning" invisible={ failingCount === 0 }>
              { icon }
            </Badge>
          </ListItemIcon>
          { !isMini && <ListItemText primary={ label } /> }
        </ListItemButton>
      </Tooltip>
    </ListItem>
  )
}
