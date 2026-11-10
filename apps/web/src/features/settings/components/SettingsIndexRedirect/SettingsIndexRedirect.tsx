// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, useLocation } from 'react-router'
// App
import { useMe } from '#src/app/useMe'
import { settingsTabs } from '../SettingsLayout/settingsTabs'

// The first tab the user can see. The server's Gmail OAuth callback returns to /settings?gmail=…;
// that notice lives on Sources, for the users who have it.
export function SettingsIndexRedirect(): ReactElement {
  const { search } = useLocation()
  const tabs = settingsTabs( useMe().me )
  const hasGmailNotice = new URLSearchParams( search ).has( 'gmail' )
  const hasSources = tabs.some( ( { value } ) => value === 'sources' )

  if( hasGmailNotice && hasSources ) {
    return <Navigate replace to={ { pathname: '/settings/sources', search } } />
  }

  return <Navigate replace to={ `/settings/${ tabs[ 0 ]?.value ?? 'prompts' }` } />
}
