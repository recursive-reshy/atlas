// React
import type { ReactElement } from 'react'
// Packages
import MailOutlinedIcon from '@mui/icons-material/MailOutlined'
import Chip from '@mui/material/Chip'

interface GmailSourceChipProps {
  name: string
}

export function GmailSourceChip( { name }: GmailSourceChipProps ): ReactElement {
  return <Chip size="small" variant="outlined" icon={ <MailOutlinedIcon /> } label={ name } />
}
