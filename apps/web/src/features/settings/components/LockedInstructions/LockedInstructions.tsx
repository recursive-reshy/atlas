// React
import type { ReactElement } from 'react'
// Packages
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Typography from '@mui/material/Typography'

const TEXT_SX = {
  fontFamily: 'monospace',
  fontSize: '0.8125rem',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const

interface LockedInstructionsProps {
  text: string
  title?: string
}

export function LockedInstructions(
  { text, title = 'Instructions the app always sends' }: LockedInstructionsProps,
): ReactElement {
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={ <ExpandMoreIcon /> }>
        <Typography>{ title }</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={ { mb: 1 } }>
          Your prompt is added after these instructions. They keep the summary in the shape the
          app needs, so they cannot be edited.
        </Typography>
        <Typography component="pre" sx={ TEXT_SX }>{ text }</Typography>
      </AccordionDetails>
    </Accordion>
  )
}
