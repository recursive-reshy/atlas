// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisOverviewArea, ThemisPeriod } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { timeSplitCaption } from '#src/features/themis/timeSplit'
import { TimeBar } from '../TimeBar'

interface TimeByAreaProps {
  areas: ThemisOverviewArea[]
  period: ThemisPeriod
  onPeriodChange: ( period: ThemisPeriod ) => void
}

const PERIODS: { value: ThemisPeriod, label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

// Measured, logged and calendar as three shades; each area's bar is sized against the busiest area
export function TimeByArea( { areas, period, onPeriodChange }: TimeByAreaProps ): ReactElement {
  const busiest = Math.max( 0, ...areas.map( ( { time } ) => time.seconds ) )

  return (
    <Stack spacing={ 2 }>
      <Stack
        direction="row"
        sx={ { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 } }
      >
        <Typography component="h2" variant="h6">Where your time went</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={ period }
          aria-label="Period"
          onChange={ ( _event, next: ThemisPeriod | null ) => {
            if( next !== null ) {
              onPeriodChange( next )
            }
          } }
        >
          { PERIODS.map( ( { value, label } ) => (
            <ToggleButton key={ value } value={ value } sx={ { minHeight: 44, minWidth: 44 } }>
              { label }
            </ToggleButton>
          ) ) }
        </ToggleButtonGroup>
      </Stack>
      <Stack component="ul" spacing={ 2 } sx={ { listStyle: 'none', m: 0, p: 0 } }>
        { areas.map( ( { id, name, time } ) => {
          const width = busiest === 0 ? 0 : time.seconds / busiest

          return (
            <Stack component="li" key={ id } aria-label={ name } spacing={ 0.5 }>
              <Stack direction="row" sx={ { justifyContent: 'space-between' } }>
                <Typography variant="body2">{ name }</Typography>
                <Typography variant="body2">{ formatStudyTime( time.seconds ) }</Typography>
              </Stack>
              <TimeBar
                measured={ time.measured }
                logged={ time.logged }
                calendar={ time.calendar }
                scale={ width }
              />
              <Typography variant="caption" color="text.secondary">
                { timeSplitCaption( time ) }
              </Typography>
            </Stack>
          )
        } ) }
      </Stack>
    </Stack>
  )
}
