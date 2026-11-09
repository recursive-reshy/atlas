// React
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'

interface TimeBarProps {
  measured: number
  logged: number
  // How much of the full width the whole bar takes, 0 to 1
  scale: number
}

const HEIGHT = 12

function Segment(
  { label, share, color }: { label: string, share: number, color: string },
): ReactElement | null {
  if( share === 0 ) {
    return null
  }

  return (
    <Box
      role="img"
      aria-label={ `${ label } ${ Math.round( share ) }%` }
      sx={ { width: `${ share }%`, height: HEIGHT, bgcolor: color } }
    />
  )
}

// Measured and logged time as two shades of one bar (ADR 0091)
export function TimeBar( { measured, logged, scale }: TimeBarProps ): ReactElement {
  const total = measured + logged

  return (
    <Box
      data-testid="time-bar"
      sx={ {
        display: 'flex',
        width: `${ scale * 100 }%`,
        borderRadius: 0.5,
        overflow: 'hidden',
      } }
    >
      <Segment
        label="Measured"
        share={ total === 0 ? 0 : measured / total * 100 }
        color="primary.main"
      />
      <Segment
        label="Logged"
        share={ total === 0 ? 0 : logged / total * 100 }
        color="secondary.main"
      />
    </Box>
  )
}
