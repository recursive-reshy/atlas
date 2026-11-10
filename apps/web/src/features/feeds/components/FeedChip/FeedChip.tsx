// React
import type { ReactElement } from 'react'
// Packages
import RssFeedIcon from '@mui/icons-material/RssFeed'
import Chip from '@mui/material/Chip'

interface FeedChipProps {
  name: string
}

export function FeedChip( { name }: FeedChipProps ): ReactElement {
  return <Chip size="small" variant="outlined" icon={ <RssFeedIcon /> } label={ name } />
}
