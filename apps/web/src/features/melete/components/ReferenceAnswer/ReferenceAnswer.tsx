// React
import type { ReactElement } from 'react'
// Packages
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const QUOTE_SX = { m: 0, pl: 2, borderLeft: 3, borderColor: 'divider', color: 'text.secondary' }

interface ReferenceAnswerProps {
  answer: string
  // '' when the question has no verbatim passage.
  passage: string
  obsidianUrl: string | null
}

export function ReferenceAnswer(
  { answer, passage, obsidianUrl }: ReferenceAnswerProps,
): ReactElement {
  return (
    <Stack spacing={ 1 }>
      <Typography variant="subtitle2" component="h3">Reference answer</Typography>
      <Typography sx={ { overflowWrap: 'anywhere' } }>{ answer }</Typography>
      { passage !== '' && (
        <Accordion variant="outlined" disableGutters>
          <AccordionSummary expandIcon={ <ExpandMoreIcon /> }>
            <Typography>Passage from the note</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography component="blockquote" sx={ { ...QUOTE_SX, overflowWrap: 'anywhere' } }>
              { passage }
            </Typography>
          </AccordionDetails>
        </Accordion>
      ) }
      { obsidianUrl !== null && (
        <Button
          variant="outlined"
          href={ obsidianUrl }
          sx={ { alignSelf: 'flex-start', minHeight: 44 } }
        >
          Open in Obsidian
        </Button>
      ) }
    </Stack>
  )
}
