// React
import type { ReactElement } from 'react'
// Packages
import ArticleIcon from '@mui/icons-material/Article'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { Job } from '@atlas/shared'
// App
import { formatExpiry } from '#src/lib/expiry'
import { FeedChip } from '#src/features/feeds/components/FeedChip'
import { GmailSourceChip } from '#src/components/GmailSourceChip'

const STATUS_LABELS = {
  queued: 'Queued',
  fetching: 'Fetching',
  transcribing: 'Transcribing',
  summarizing: 'Summarizing',
  linking: 'Linking',
  ready_for_review: 'Ready for review',
  summary_failed: 'Summary failed',
  saved: 'Saved',
  failed: 'Failed',
} as const satisfies Record< Job[ 'status' ], string >

const EXPIRING_STATUSES: Job[ 'status' ][] = [ 'ready_for_review', 'summary_failed' ]

const LIST_SX = { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' } as const

const ITEM_SX = {
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.25rem 1rem',
  px: 2,
  py: 1,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
} as const

const LINK_SX = { flex: '1 1 12rem', overflowWrap: 'anywhere' } as const

interface JobListProps {
  jobs: Job[]
  now: number
}

export function JobList( { jobs, now }: JobListProps ): ReactElement | null {
  if( jobs.length === 0 ) {
    return null
  }

  return (
    <List aria-label="Jobs" disablePadding sx={ LIST_SX }>
      { jobs.map( ( job ) => (
        <ListItem key={ job.id } sx={ ITEM_SX }>
          { job.source_type === 'article'
            ? <ArticleIcon fontSize="small" titleAccess="Article" color="action" />
            : <OndemandVideoIcon fontSize="small" titleAccess="Video" color="action" /> }
          <Link component={ RouterLink } to={ `/jobs/${ job.id }` } sx={ LINK_SX }>
            { job.title ?? job.url }
          </Link>
          { job.feed_name !== null && <FeedChip name={ job.feed_name } /> }
          { job.gmail_source_name !== null && <GmailSourceChip name={ job.gmail_source_name } /> }
          <Typography component="span" sx={ { fontWeight: 600 } }>
            { STATUS_LABELS[ job.status ] }
          </Typography>
          { job.expires_at !== null && EXPIRING_STATUSES.includes( job.status ) && (
            <Typography component="span" variant="body2" color="text.secondary">
              { formatExpiry( job.expires_at, now ) }
            </Typography>
          ) }
        </ListItem>
      ) ) }
    </List>
  )
}
