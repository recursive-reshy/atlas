// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { ThemisGoalStatus } from '@atlas/shared'
// App
import { useThemisGoals } from '#src/hooks/useThemisGoals'

const GROUPS: { status: ThemisGoalStatus, title: string }[] = [
  { status: 'active', title: 'Active' },
  { status: 'achieved', title: 'Achieved' },
  { status: 'dropped', title: 'Dropped' },
]

// Every goal, so achieved and dropped ones stay reachable with their history (ADR 0095)
export function AllGoals(): ReactElement {
  const { goals, isLoading, error } = useThemisGoals()

  if( isLoading ) {
    return <Typography role="status">Loading goals…</Typography>
  }

  if( goals === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the goals' }</Alert>
  }

  return (
    <Stack spacing={ 3 } sx={ { maxWidth: '40rem' } }>
      <Link
        component={ RouterLink }
        to="/themis"
        sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
      >
        Back to Themis
      </Link>
      <Typography component="h1" variant="h5">All goals</Typography>
      { goals.length === 0 && <Typography color="text.secondary">No goals yet</Typography> }
      { GROUPS.map( ( { status, title } ) => {
        const inGroup = goals.filter( ( { goal } ) => goal.status === status )

        return inGroup.length === 0 ? null : (
          <Stack
            component="section"
            key={ status }
            aria-labelledby={ `goals-${ status }` }
            spacing={ 1 }
          >
            <Typography component="h2" variant="h6" id={ `goals-${ status }` }>
              { title }
            </Typography>
            <Stack component="ul" spacing={ 1 } sx={ { listStyle: 'none', m: 0, p: 0 } }>
              { inGroup.map( ( { goal, area_name: area } ) => (
                <Stack component="li" key={ goal.id }>
                  <Link
                    component={ RouterLink }
                    to={ `/themis/goals/${ goal.id }` }
                    sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
                  >
                    { goal.name }
                  </Link>
                  <Typography variant="body2" color="text.secondary">{ area }</Typography>
                </Stack>
              ) ) }
            </Stack>
          </Stack>
        )
      } ) }
    </Stack>
  )
}
