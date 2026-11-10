// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { FeedChip } from '#src/features/feeds/components/FeedChip'
import { GmailSourceChip } from '#src/features/gmail/components/GmailSourceChip'

interface JobHeadingProps {
  title: string
  feedName: string | null
  gmailSourceName: string | null
}

export function JobHeading(
  { title, feedName, gmailSourceName }: JobHeadingProps,
): ReactElement {
  return (
    <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', flexWrap: 'wrap' } }>
      <Typography variant="h6" component="h2" sx={ { overflowWrap: 'anywhere' } }>
        { title }
      </Typography>
      { feedName !== null && <FeedChip name={ feedName } /> }
      { gmailSourceName !== null && <GmailSourceChip name={ gmailSourceName } /> }
    </Stack>
  )
}
