// React
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteQuestion } from '@atlas/shared'
// App
import { formatDate } from '#src/formatDate'

interface MeleteQuestionItemProps {
  question: MeleteQuestion
  onDrop: () => void
}

const QUOTE_SX = {
  m: 0,
  pl: 2,
  borderLeft: 3,
  borderColor: 'divider',
  color: 'text.secondary',
} as const

const scheduleOf = ( question: MeleteQuestion ): string => {
  const reviews = `${ question.reps } ${ question.reps === 1 ? 'review' : 'reviews' }`

  return `${ question.due === null ? 'New' : `Due ${ formatDate( question.due ) }` } · ${ reviews }`
}

export function MeleteQuestionItem( { question, onDrop }: MeleteQuestionItemProps ): ReactElement {
  const isDropped = question.state === 'dropped'

  return (
    <Paper variant="outlined" sx={ { p: 2, opacity: isDropped ? 0.6 : 1 } }>
      <Stack spacing={ 1 }>
        <Typography variant="subtitle1">{ question.prompt }</Typography>
        <Typography>{ question.answer }</Typography>
        { question.passage !== '' && (
          <Box component="blockquote" sx={ QUOTE_SX }>
            <Typography variant="body2">{ question.passage }</Typography>
          </Box>
        ) }
        { !isDropped && (
          <Stack
            direction="row"
            sx={ { alignItems: 'center', justifyContent: 'space-between' } }
          >
            <Typography variant="caption" color="text.secondary">
              { scheduleOf( question ) }
            </Typography>
            <Button size="small" sx={ { minHeight: 44 } } onClick={ onDrop }>Drop</Button>
          </Stack>
        ) }
      </Stack>
    </Paper>
  )
}
