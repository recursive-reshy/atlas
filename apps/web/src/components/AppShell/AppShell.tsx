// React
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
// Packages
import MenuIcon from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
// App
import { NavDrawer } from '../NavDrawer'
import { useNavDrawer } from '#src/hooks/useNavDrawer'

const DRAWER_ID = 'navigation-drawer'

const CARD_SX = {
  maxWidth: '64rem',
  mx: 'auto',
  p: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
} as const

type AppShellProps = {
  children: ReactNode
}

export function AppShell( { children }: AppShellProps ): ReactElement {
  const theme = useTheme()
  const isNarrow = useMediaQuery( theme.breakpoints.down( 'md' ) )
  const { isExpanded, toggle } = useNavDrawer()
  const [ isOpen, setIsOpen ] = useState( false )
  const isNavigationShown = isNarrow ? isOpen : isExpanded

  const handleHamburger = (): void => {
    if( isNarrow ) {
      setIsOpen( ( wasOpen ) => !wasOpen )
    } else {
      toggle()
    }
  }

  return (
    <Box sx={ { display: 'flex' } }>
      <AppBar position="fixed" sx={ { zIndex: theme.zIndex.drawer + 1 } }>
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            aria-label={ isNavigationShown ? 'Close navigation' : 'Open navigation' }
            aria-expanded={ isNavigationShown }
            aria-controls={ DRAWER_ID }
            onClick={ handleHamburger }
            sx={ { mr: 2 } }
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="h1" noWrap>Atlas</Typography>
        </Toolbar>
      </AppBar>
      <NavDrawer
        id={ DRAWER_ID }
        isNarrow={ isNarrow }
        isExpanded={ isExpanded }
        isOpen={ isOpen }
        onClose={ () => setIsOpen( false ) }
      />
      <Box component="main" sx={ { flexGrow: 1, minWidth: 0, p: 2 } }>
        <Toolbar variant="dense" />
        <Paper variant="outlined" sx={ CARD_SX }>{ children }</Paper>
      </Box>
    </Box>
  )
}
