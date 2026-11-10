// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
// App
import { FeedSettings } from '#src/features/feeds/components/FeedSettings'
import { GmailSettings } from '#src/features/gmail/components/GmailSettings'
import { StatusPanel } from '#src/features/status/components/StatusPanel'
import { useMe } from '#src/app/useMe'
import { CalendarSettings } from '../CalendarSettings'

export function SourcesTab(): ReactElement {
  const hasThemis = useMe().me?.modules.includes( 'themis' ) === true

  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '52rem' } }>
      <StatusPanel />
      <FeedSettings />
      <GmailSettings />
      { hasThemis && <CalendarSettings /> }
    </Stack>
  )
}
