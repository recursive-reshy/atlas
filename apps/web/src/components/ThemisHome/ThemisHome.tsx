// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useSearchParams } from 'react-router'
// Shared
import { ThemisPeriod } from '@atlas/shared'
// App
import { useThemisOverview } from '#src/hooks/useThemisOverview'
import { AddAreaForm } from '../AddAreaForm'
import { CheckinsDue } from '../CheckinsDue'
import { GoalCard } from '../GoalCard'
import { TimeByArea } from '../TimeByArea'

// The home: check-ins due, where the time went, then goals by area (ADR 0092)
export function ThemisHome(): ReactElement {
  const [ params, setParams ] = useSearchParams()
  const parsed = ThemisPeriod.safeParse( params.get( 'period' ) )
  const period = parsed.success ? parsed.data : 'week'
  const { overview, isLoading, error } = useThemisOverview( period )

  if( isLoading ) {
    return <Typography role="status">Loading Themis…</Typography>
  }

  if( overview === null ) {
    return <Alert severity="error">{ error ?? 'Could not load Themis' }</Alert>
  }

  if( overview.areas.length === 0 ) {
    return (
      <Stack spacing={ 2 } sx={ { maxWidth: '40rem' } }>
        <Typography component="h1" variant="h5">Themis</Typography>
        <Typography component="h2" variant="h6">Add your first area</Typography>
        <Typography color="text.secondary">
          Areas are the parts of your life you set goals in, such as Career or Health.
        </Typography>
        <AddAreaForm />
      </Stack>
    )
  }

  return (
    <Stack spacing={ 4 } sx={ { maxWidth: '40rem' } }>
      <Typography component="h1" variant="h5">Themis</Typography>
      <CheckinsDue due={ overview.checkins_due } />
      <TimeByArea
        areas={ overview.areas }
        period={ period }
        onPeriodChange={ ( next ) => setParams( { period: next } ) }
      />
      { overview.areas.map( ( { id, name, goals } ) => (
        <Stack component="section" key={ id } aria-labelledby={ `area-${ id }` } spacing={ 1.5 }>
          <Typography component="h2" variant="h6" id={ `area-${ id }` }>{ name }</Typography>
          { goals.length === 0 && (
            <Typography color="text.secondary">No active goals</Typography>
          ) }
          { goals.map( ( card ) => <GoalCard key={ card.goal.id } card={ card } /> ) }
        </Stack>
      ) ) }
    </Stack>
  )
}
