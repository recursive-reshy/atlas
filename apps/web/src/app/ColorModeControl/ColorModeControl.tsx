// React
import { useState } from 'react'
import type { MouseEvent, ReactElement } from 'react'
// Packages
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'

type Mode = 'light' | 'dark' | 'system'

const GROUP_LABEL = 'Colour mode'

const TOGGLE_SX = { gap: 0.5, px: 0.5, fontSize: '0.75rem' } as const

const CHOICES = [
  { mode: 'light', label: 'Light', icon: <LightModeIcon fontSize="small" /> },
  { mode: 'dark', label: 'Dark', icon: <DarkModeIcon fontSize="small" /> },
  { mode: 'system', label: 'System', icon: <SettingsBrightnessIcon fontSize="small" /> },
] as const satisfies readonly { mode: Mode, label: string, icon: ReactElement }[]

type ColorModeControlProps = {
  isCollapsed: boolean
}

export function ColorModeControl( { isCollapsed }: ColorModeControlProps ): ReactElement {
  const { mode, setMode } = useColorScheme()
  const [ anchor, setAnchor ] = useState< HTMLElement | null >( null )
  const isDisabled = mode === undefined

  if( isCollapsed ) {
    const handleChoose = ( choice: Mode ): void => {
      setMode( choice )
      setAnchor( null )
    }

    return (
      <>
        <Tooltip title={ GROUP_LABEL } placement="right">
          <span>
            <IconButton
              aria-label={ GROUP_LABEL }
              aria-haspopup="menu"
              disabled={ isDisabled }
              onClick={ ( event: MouseEvent< HTMLElement > ) => setAnchor( event.currentTarget ) }
            >
              <SettingsBrightnessIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Menu anchorEl={ anchor } open={ anchor !== null } onClose={ () => setAnchor( null ) }>
          { CHOICES.map( ( { mode: choice, label, icon } ) => (
            <MenuItem
              key={ choice }
              role="menuitemradio"
              aria-checked={ mode === choice }
              selected={ mode === choice }
              onClick={ () => handleChoose( choice ) }
            >
              <ListItemIcon>{ icon }</ListItemIcon>
              { label }
            </MenuItem>
          ) ) }
        </Menu>
      </>
    )
  }

  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      size="small"
      aria-label={ GROUP_LABEL }
      value={ mode ?? null }
      disabled={ isDisabled }
      onChange={ ( _event, choice: Mode | null ) => {
        if( choice !== null ) {
          setMode( choice )
        }
      } }
    >
      { CHOICES.map( ( { mode: choice, label, icon } ) => (
        <ToggleButton key={ choice } value={ choice } sx={ TOGGLE_SX }>
          { icon }
          { label }
        </ToggleButton>
      ) ) }
    </ToggleButtonGroup>
  )
}
