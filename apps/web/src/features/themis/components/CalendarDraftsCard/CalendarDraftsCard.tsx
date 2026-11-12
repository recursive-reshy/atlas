// React
import type { ReactElement } from 'react'
// Packages
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import { Link as RouterLink } from 'react-router'
// Shared
import type { CalendarConnectionStatus } from '@atlas/shared'

interface CalendarDraftsCardProps {
  drafts: number
  status: CalendarConnectionStatus
}

// A broken connection still has drafts to review; only no calendar, or none waiting, hides it
const SHOWS_FOR: CalendarConnectionStatus[] = [ 'connected', 'broken' ]

export function CalendarDraftsCard(
  { drafts, status }: CalendarDraftsCardProps,
): ReactElement | null {
  if( drafts === 0 || !SHOWS_FOR.includes( status ) ) {
    return null
  }

  return (
    <Paper variant="outlined" sx={ { px: 2 } }>
      <Link
        component={ RouterLink }
        to="/themis/calendar"
        sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
      >
        { `${ drafts } calendar ${ drafts === 1 ? 'draft' : 'drafts' } to review` }
      </Link>
    </Paper>
  )
}
