// React
import type { ReactElement } from 'react'
// Packages
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisGoalOutcome } from '@atlas/shared'

interface OutcomeDisplayProps {
  outcome: ThemisGoalOutcome
}

const percent = ( value: number ): number => Math.round( value * 100 )

function Bar( { label, value }: { label: string, value: number } ): ReactElement {
  return (
    <Stack spacing={ 0.5 }>
      <Typography variant="body2">{ `${ label } ${ percent( value ) }%` }</Typography>
      <LinearProgress
        variant="determinate"
        value={ percent( value ) }
        aria-label={ label }
        sx={ { height: 8, borderRadius: 1 } }
      />
    </Stack>
  )
}

const withUnit = ( value: number, unit: string | null ): string => {
  return unit === null ? `${ value }` : `${ value } ${ unit }`
}

type MetricOutcome = Extract< ThemisGoalOutcome, { type: 'metric' } >

function MetricOutcomeView( { outcome }: { outcome: MetricOutcome } ): ReactElement {
  const { unit, target, latest, updates } = outcome

  if( latest === null ) {
    return (
      <Typography variant="body2">
        { `No updates yet, target ${ withUnit( target, unit ) }` }
      </Typography>
    )
  }

  // Updates come newest first; the trend reads oldest to newest
  const trend = [ ...updates ].reverse().map( ( { value } ) => value )
  const share = target > 0
    ? Math.min( 100, Math.max( 0, Math.round( latest / target * 100 ) ) )
    : null

  return (
    <Stack spacing={ 0.5 }>
      <Typography variant="body2">
        { `${ withUnit( latest, unit ) } of ${ withUnit( target, unit ) }` }
      </Typography>
      { share !== null && (
        <LinearProgress
          variant="determinate"
          value={ share }
          aria-label="Progress to target"
          sx={ { height: 8, borderRadius: 1 } }
        />
      ) }
      { trend.length > 1 && (
        <Typography variant="caption" color="text.secondary">
          { `Trend ${ trend.join( ' → ' ) }` }
        </Typography>
      ) }
    </Stack>
  )
}

// What a goal shows as progress, by its outcome type (ADR 0092)
export function OutcomeDisplay( { outcome }: OutcomeDisplayProps ): ReactElement {
  if( outcome.type === 'learning' ) {
    if( outcome.coverage === null || outcome.mastery === null ) {
      return (
        <Typography variant="body2" color="text.secondary">
          No approved syllabus linked yet
        </Typography>
      )
    }

    return (
      <Stack spacing={ 1 }>
        <Bar label="Coverage" value={ outcome.coverage } />
        <Bar label="Mastery" value={ outcome.mastery } />
      </Stack>
    )
  }

  if( outcome.type === 'metric' ) {
    return <MetricOutcomeView outcome={ outcome } />
  }

  const cadence = outcome.cadence === 'weekly' ? 'Weekly' : 'Monthly'
  const ratings = [ ...outcome.ratings ].reverse().map( ( { rating } ) => rating )

  return (
    <Typography variant="body2">
      { `${ cadence } check-ins: ${ ratings.length === 0 ? 'none yet' : ratings.join( ' → ' ) }` }
    </Typography>
  )
}
