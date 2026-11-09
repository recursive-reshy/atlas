// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisWeekTime } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/formatStudyTime'
import { TimeBar } from '../TimeBar'

interface GoalTimeByWeekProps {
  // Oldest first, as the server sends them
  weeks: ThemisWeekTime[]
}

// Twelve weeks of a goal's time, newest first, each bar sized against the busiest week
export function GoalTimeByWeek( { weeks }: GoalTimeByWeekProps ): ReactElement {
  const busiest = Math.max( 0, ...weeks.map( ( { measured, logged } ) => measured + logged ) )
  const rows = busiest === 0 ? [] : [ ...weeks ].reverse()

  return (
    <Stack spacing={ 1.5 }>
      <Typography component="h2" variant="h6">Time by week</Typography>
      { busiest === 0 && <Typography color="text.secondary">No time yet</Typography> }
      <Stack component="ul" spacing={ 1.5 } sx={ { listStyle: 'none', m: 0, p: 0 } }>
        { rows.map( ( { week_start: start, measured, logged } ) => (
          <Stack component="li" key={ start } aria-label={ `Week of ${ start }` } spacing={ 0.5 }>
            <Stack direction="row" sx={ { justifyContent: 'space-between' } }>
              <Typography variant="body2">{ start }</Typography>
              <Typography variant="body2">{ formatStudyTime( measured + logged ) }</Typography>
            </Stack>
            <TimeBar
              measured={ measured }
              logged={ logged }
              scale={ ( measured + logged ) / busiest }
            />
            <Typography variant="caption" color="text.secondary">
              { `${ formatStudyTime( measured ) } measured` }
              { ` · ${ formatStudyTime( logged ) } logged` }
            </Typography>
          </Stack>
        ) ) }
      </Stack>
    </Stack>
  )
}
