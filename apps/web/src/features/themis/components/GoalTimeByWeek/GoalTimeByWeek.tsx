// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisWeekTime } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { timeSplitCaption } from '#src/features/themis/timeSplit'
import { TimeBar } from '../TimeBar'

interface GoalTimeByWeekProps {
  // Oldest first, as the server sends them
  weeks: ThemisWeekTime[]
}

const total = ( { measured, logged, calendar }: ThemisWeekTime ): number => (
  measured + logged + calendar
)

// Twelve weeks of a goal's time, newest first, each bar sized against the busiest week
export function GoalTimeByWeek( { weeks }: GoalTimeByWeekProps ): ReactElement {
  const busiest = Math.max( 0, ...weeks.map( ( week ) => total( week ) ) )
  const rows = busiest === 0 ? [] : [ ...weeks ].reverse()

  return (
    <Stack spacing={ 1.5 }>
      <Typography component="h2" variant="h6">Time by week</Typography>
      { busiest === 0 && <Typography color="text.secondary">No time yet</Typography> }
      <Stack component="ul" spacing={ 1.5 } sx={ { listStyle: 'none', m: 0, p: 0 } }>
        { rows.map( ( week ) => (
          <Stack
            component="li"
            key={ week.week_start }
            aria-label={ `Week of ${ week.week_start }` }
            spacing={ 0.5 }
          >
            <Stack direction="row" sx={ { justifyContent: 'space-between' } }>
              <Typography variant="body2">{ week.week_start }</Typography>
              <Typography variant="body2">{ formatStudyTime( total( week ) ) }</Typography>
            </Stack>
            <TimeBar
              measured={ week.measured }
              logged={ week.logged }
              calendar={ week.calendar }
              scale={ total( week ) / busiest }
            />
            <Typography variant="caption" color="text.secondary">
              { timeSplitCaption( week ) }
            </Typography>
          </Stack>
        ) ) }
      </Stack>
    </Stack>
  )
}
