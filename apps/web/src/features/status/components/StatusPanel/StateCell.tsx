// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { HealthState } from '@atlas/shared'
// App
import { STATE_COLORS, STATE_ICONS, STATE_LABELS } from './statusLabels'

interface StateCellProps {
  state: HealthState
}

// An icon and the word, so the state never rests on colour alone.
export function StateCell( { state }: StateCellProps ): ReactElement {
  const Icon = STATE_ICONS[ state ]

  return (
    <Stack direction="row" spacing={ 0.5 } sx={ { alignItems: 'center' } }>
      <Icon fontSize="small" sx={ { color: STATE_COLORS[ state ] } } />
      <Typography variant="body2" sx={ { fontWeight: 600 } }>{ STATE_LABELS[ state ] }</Typography>
    </Stack>
  )
}
