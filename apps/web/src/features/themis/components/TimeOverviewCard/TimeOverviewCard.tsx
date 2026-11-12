// React
import type { ReactElement } from 'react'
// Packages
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { ThemisGoalCard, ThemisOverviewArea, ThemisPeriod } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { timeSplitCaption } from '#src/features/themis/timeSplit'
import { TimeBar } from '../TimeBar'
import { TimeByArea } from '../TimeByArea'

interface TimeOverviewCardProps {
  areas: ThemisOverviewArea[]
  period: ThemisPeriod
  onPeriodChange: ( period: ThemisPeriod ) => void
}

const TOP_GOALS = 5

// Goals with no time are left out, and so is the list when none has any
const topGoals = ( areas: ThemisOverviewArea[] ): ThemisGoalCard[] => areas
  .flatMap( ( { goals } ) => goals )
  .filter( ( { time } ) => time.seconds > 0 )
  .sort( ( a, b ) => b.time.seconds - a.time.seconds )
  .slice( 0, TOP_GOALS )

// Where the time went by area, then the five goals it went to (ADR 0109)
export function TimeOverviewCard(
  { areas, period, onPeriodChange }: TimeOverviewCardProps,
): ReactElement {
  const goals = topGoals( areas )
  const busiest = goals[ 0 ]?.time.seconds ?? 0

  return (
    <Stack spacing={ 3 }>
      <TimeByArea areas={ areas } period={ period } onPeriodChange={ onPeriodChange } />
      { goals.length > 0 && (
        <Stack spacing={ 2 }>
          <Typography component="h2" variant="h6">Top goals</Typography>
          <Stack
            component="ul"
            aria-label="Top goals"
            spacing={ 2 }
            sx={ { listStyle: 'none', m: 0, p: 0 } }
          >
            { goals.map( ( { goal, time } ) => (
              <Stack component="li" key={ goal.id } spacing={ 0.5 }>
                <Stack
                  direction="row"
                  sx={ { justifyContent: 'space-between', alignItems: 'center', gap: 1 } }
                >
                  <Link
                    component={ RouterLink }
                    to={ `/themis/goals/${ goal.id }` }
                    variant="body2"
                    sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
                  >
                    { goal.name }
                  </Link>
                  <Typography variant="body2">{ formatStudyTime( time.seconds ) }</Typography>
                </Stack>
                <TimeBar
                  measured={ time.measured }
                  logged={ time.logged }
                  calendar={ time.calendar }
                  scale={ time.seconds / busiest }
                />
                <Typography variant="caption" color="text.secondary">
                  { timeSplitCaption( time ) }
                </Typography>
              </Stack>
            ) ) }
          </Stack>
        </Stack>
      ) }
    </Stack>
  )
}
