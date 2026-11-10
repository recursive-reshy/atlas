// React
import type { ReactElement } from 'react'
// Packages
import { Outlet } from 'react-router'
// App
import { AppShell } from './app/AppShell'
import { useRemoveLegacyDrafts } from './features/jobs/hooks/useRemoveLegacyDrafts'

export function App(): ReactElement {
  useRemoveLegacyDrafts()

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
