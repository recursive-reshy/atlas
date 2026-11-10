// React
import type { ReactElement } from 'react'
// Packages
import ArticleIcon from '@mui/icons-material/Article'
import ClearIcon from '@mui/icons-material/Clear'
import MailOutlinedIcon from '@mui/icons-material/MailOutlined'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import SummarizeIcon from '@mui/icons-material/Summarize'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { InboxItem } from '@atlas/shared'
// App
import { formatDate } from '#src/lib/formatDate'
import { FeedChip } from '#src/features/feeds/components/FeedChip'
import { GmailSourceChip } from '#src/features/gmail/components/GmailSourceChip'

const ITEM_SX = {
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.25rem 0.75rem',
  px: 1,
  py: 0.5,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
} as const

const TITLE_SX = { flex: '1 1 12rem', minWidth: 0, overflowWrap: 'anywhere' } as const

interface InboxRowProps {
  item: InboxItem
  isSelected: boolean
  onToggle: () => void
  onSummarize: () => void
  onDismiss: () => void
}

function ItemIcon( { item }: { item: InboxItem } ): ReactElement {
  if( item.kind === 'gmail' ) {
    return <MailOutlinedIcon fontSize="small" titleAccess="Email" color="action" />
  }

  return item.source_type === 'article'
    ? <ArticleIcon fontSize="small" titleAccess="Article" color="action" />
    : <OndemandVideoIcon fontSize="small" titleAccess="Video" color="action" />
}

export function InboxRow(
  { item, isSelected, onToggle, onSummarize, onDismiss }: InboxRowProps,
): ReactElement {
  return (
    <ListItem sx={ ITEM_SX }>
      <Checkbox
        slotProps={ { input: { 'aria-label': `Select ${ item.title }` } } }
        checked={ isSelected }
        onChange={ onToggle }
      />
      <ItemIcon item={ item } />
      <Stack sx={ TITLE_SX }>
        <Link href={ item.link } target="_blank" rel="noopener noreferrer">{ item.title }</Link>
        { item.kind === 'gmail' && (
          <Typography variant="body2" color="text.secondary">{ item.sender }</Typography>
        ) }
      </Stack>
      { item.kind === 'gmail'
        ? <GmailSourceChip name={ item.source_name } />
        : <FeedChip name={ item.feed_name } /> }
      <Typography component="span" variant="body2" color="text.secondary">
        { formatDate( item.published_at ?? item.added_at ) }
      </Typography>
      <IconButton size="small" aria-label={ `Summarize ${ item.title }` } onClick={ onSummarize }>
        <SummarizeIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label={ `Dismiss ${ item.title }` } onClick={ onDismiss }>
        <ClearIcon fontSize="small" />
      </IconButton>
    </ListItem>
  )
}
