// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useSearchParams } from 'react-router'
// Shared
import { ThemisPeriod } from '@atlas/shared'
// App
import { CalendarDraftsCard } from '#src/features/themis/components/CalendarDraftsCard'
import { ConnectCalendarPrompt } from '#src/features/themis/components/ConnectCalendarPrompt'
import { TimeOverviewCard } from '#src/features/themis/components/TimeOverviewCard'
import { useCalendarSync } from '#src/features/themis/hooks/useCalendarSync'
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'

// The landing page, made of cards from the modules; it owns no data (ADR 0109). Only Themis
// contributes in 1.2.
export function HomeScreen(): ReactElement {
  const [ params, setParams ] = useSearchParams()
  const parsed = ThemisPeriod.safeParse( params.get( 'period' ) )
  const period = parsed.success ? parsed.data : 'week'
  const { overview, isLoading, error } = useThemisOverview( period )

  // Reads the calendar in the background; the cards below never wait for it
  useCalendarSync( overview?.calendar_status === 'connected' )

  return (
    <Stack spacing={ 3 } sx={ { maxWidth: '40rem' } }>
      <Typography component="h1" variant="h5">Home</Typography>
      { isLoading && <Typography role="status">Loading Home…</Typography> }
      { error !== null && overview === null && <Alert severity="error">{ error }</Alert> }
      { overview !== null && (
        <>
          <ConnectCalendarPrompt status={ overview.calendar_status } />
          <CalendarDraftsCard
            drafts={ overview.calendar_drafts }
            status={ overview.calendar_status }
          />
          { overview.areas.length === 0
            ? (
              <Typography color="text.secondary">
                Nothing to show yet.{ ' ' }
                <Link component={ RouterLink } to="/themis">Add an area in Themis</Link>
              </Typography>
            )
            : (
              <TimeOverviewCard
                areas={ overview.areas }
                period={ period }
                onPeriodChange={ ( next ) => setParams( { period: next } ) }
              />
            ) }
        </>
      ) }
    </Stack>
  )
}
