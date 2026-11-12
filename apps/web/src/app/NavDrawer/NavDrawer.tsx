// React
import type { ReactElement } from 'react'
// Packages
import HomeIcon from '@mui/icons-material/HomeOutlined'
import ThemisIcon from '@mui/icons-material/BalanceOutlined'
import MeleteIcon from '@mui/icons-material/SchoolOutlined'
import SettingsIcon from '@mui/icons-material/Settings'
import TranscriberIcon from '@mui/icons-material/GraphicEq'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import Toolbar from '@mui/material/Toolbar'
import { useLocation } from 'react-router'
// App
import { useMe } from '../useMe'
import { useStatus } from '#src/features/status/hooks/useStatus'
import { ColorModeControl } from '../ColorModeControl'
import { NavItem } from '../NavItem'
import { SignOutItem } from '../SignOutItem'

const DRAWER_WIDTH = 240
const MINI_DRAWER_WIDTH = 64

// In drawer order, matching moduleHome.ts. Home is Themis's card page and shows with it.
const NAV_ITEMS = [
  {
    module: 'themis',
    label: 'Home',
    to: '/',
    icon: <HomeIcon />,
    isCurrent: ( pathname: string ): boolean => pathname === '/',
  },
  {
    module: 'themis',
    label: 'Themis',
    to: '/themis',
    icon: <ThemisIcon />,
    isCurrent: ( pathname: string ): boolean => (
      pathname === '/themis' || pathname.startsWith( '/themis/' )
    ),
  },
  {
    module: 'transcriber',
    label: 'Mnemosyne',
    to: '/transcriber',
    icon: <TranscriberIcon />,
    isCurrent: ( pathname: string ): boolean => (
      pathname === '/transcriber' || pathname.startsWith( '/transcriber/' )
    ),
  },
  {
    module: 'melete',
    label: 'Melete',
    to: '/melete',
    icon: <MeleteIcon />,
    isCurrent: ( pathname: string ): boolean => (
      pathname === '/melete' || pathname.startsWith( '/melete/' )
    ),
  },
] as const

type NavDrawerProps = {
  id: string
  isNarrow: boolean
  isExpanded: boolean
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer(
  { id, isNarrow, isExpanded, isOpen, onClose }: NavDrawerProps,
): ReactElement {
  const { pathname } = useLocation()
  const { failingCount } = useStatus()
  const modules = useMe().me?.modules ?? []
  const items = NAV_ITEMS.filter( ( { module } ) => modules.includes( module ) )
  const isMini = !isNarrow && !isExpanded
  const width = isMini ? MINI_DRAWER_WIDTH : DRAWER_WIDTH
  const onNavigate = isNarrow ? onClose : undefined

  const contents = (
    <>
      <Toolbar variant="dense" />
      <List component="nav" aria-label="Main">
        { items.map( ( { label, to, icon, isCurrent } ) => (
          <NavItem
            key={ to }
            label={ label }
            to={ to }
            icon={ icon }
            isSelected={ isCurrent( pathname ) }
            isMini={ isMini }
            onNavigate={ onNavigate }
          />
        ) ) }
      </List>
      <Box sx={ { mt: 'auto' } }>
        <Divider />
        <List disablePadding>
          <NavItem
            label="Settings"
            to="/settings"
            icon={ <SettingsIcon /> }
            isSelected={ pathname === '/settings' || pathname.startsWith( '/settings/' ) }
            isMini={ isMini }
            onNavigate={ onNavigate }
            failingCount={ failingCount }
          />
          <SignOutItem isMini={ isMini } />
        </List>
        <Box sx={ { p: 1 } }>
          <ColorModeControl isCollapsed={ isMini } />
        </Box>
      </Box>
    </>
  )

  if( isNarrow ) {
    return (
      <Drawer
        id={ id }
        variant="temporary"
        open={ isOpen }
        onClose={ onClose }
        slotProps={ { paper: { sx: { width: DRAWER_WIDTH } } } }
      >
        { contents }
      </Drawer>
    )
  }

  return (
    <Drawer
      id={ id }
      variant="permanent"
      sx={ { width, flexShrink: 0 } }
      slotProps={ { paper: { sx: { width, overflowX: 'hidden' } } } }
    >
      { contents }
    </Drawer>
  )
}
