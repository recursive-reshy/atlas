// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router'
// App
import { useMe } from '#src/app/useMe'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { settingsTabs } from './settingsTabs'

const ALL_TAB_VALUES = [ 'prompts', 'models', 'sources', 'admin' ]

export function SettingsLayout(): ReactElement {
  const { isLoading, error } = useSettings()
  const tabs = settingsTabs( useMe().me )
  const current = useLocation().pathname.split( '/' )[ 2 ]
  const value = tabs.some( ( tab ) => tab.value === current ) ? current : false

  // A tab this user can't see: the server refuses its data too, so don't show an empty page.
  if( value === false && ALL_TAB_VALUES.includes( current ) && tabs.length > 0 ) {
    return <Navigate to={ `/settings/${ tabs[ 0 ].value }` } replace />
  }

  return (
    <Stack spacing={ 3 } sx={ { width: '100%' } }>
      <Typography variant="h5" component="h2">Settings</Typography>
      <Tabs value={ value } aria-label="Settings sections">
        { tabs.map( ( tab ) => (
          <Tab
            key={ tab.value }
            component={ Link }
            to={ `/settings/${ tab.value }` }
            value={ tab.value }
            label={ tab.label }
          />
        ) ) }
      </Tabs>
      { isLoading && <Typography role="status">Loading settings…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { !isLoading && error === null && <Outlet /> }
    </Stack>
  )
}
