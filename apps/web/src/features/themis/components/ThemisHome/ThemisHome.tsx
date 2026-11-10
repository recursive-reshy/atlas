// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useSearchParams } from 'react-router'
// Shared
import { ThemisPeriod } from '@atlas/shared'
// App
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { AddAreaForm } from '../AddAreaForm'
import { AllGoals } from '../AllGoals'
import { AreaDialog } from '../AreaDialog'
import { AreaSection } from '../AreaSection'
import { CheckinsDue } from '../CheckinsDue'
import { GoalDialog } from '../GoalDialog'
import { LogTimeButton } from '../LogTimeButton'
import { TimeByArea } from '../TimeByArea'

type Open =
  | { kind: 'area', area: { id: string, name: string } | null }
  | { kind: 'goal', areaId: string }
  | null

// The home: check-ins due, where the time went, then goals by area (ADR 0092)
export function ThemisHome(): ReactElement {
  const [ params, setParams ] = useSearchParams()
  const [ open, setOpen ] = useState< Open >( null )
  const parsed = ThemisPeriod.safeParse( params.get( 'period' ) )
  const period = parsed.success ? parsed.data : 'week'
  const { overview, isLoading, error } = useThemisOverview( period )

  if( params.get( 'view' ) === 'all' ) {
    return <AllGoals />
  }

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
        <LogTimeButton isFloating />
      </Stack>
    )
  }

  const close = (): void => setOpen( null )

  return (
    <Stack spacing={ 4 } sx={ { maxWidth: '40rem' } }>
      <Stack
        direction="row"
        sx={ { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' } }
      >
        <Typography component="h1" variant="h5">Themis</Typography>
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
          <Link
            component={ RouterLink }
            to="/themis?view=all"
            sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
          >
            All goals
          </Link>
          <Button
            onClick={ () => setOpen( { kind: 'area', area: null } ) }
            sx={ { minHeight: 44 } }
          >
            Add area
          </Button>
        </Stack>
      </Stack>
      <CheckinsDue due={ overview.checkins_due } />
      <TimeByArea
        areas={ overview.areas }
        period={ period }
        onPeriodChange={ ( next ) => setParams( { period: next } ) }
      />
      { overview.calendar_status !== 'not_configured' && (
        <Link
          component={ RouterLink }
          to="/themis/calendar"
          sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
        >
          Calendar time
        </Link>
      ) }
      { overview.areas.map( ( area ) => (
        <AreaSection
          key={ area.id }
          area={ area }
          onEdit={ ( edited ) => setOpen( { kind: 'area', area: edited } ) }
          onAddGoal={ ( areaId ) => setOpen( { kind: 'goal', areaId } ) }
        />
      ) ) }
      <LogTimeButton isFloating />
      { open?.kind === 'area' && <AreaDialog area={ open.area } onClose={ close } /> }
      { open?.kind === 'goal' && (
        <GoalDialog
          goal={ null }
          areaId={ open.areaId }
          areas={ overview.areas }
          onClose={ close }
        />
      ) }
    </Stack>
  )
}
