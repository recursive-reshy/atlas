// React
import type { ReactElement } from 'react'
// Packages
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorIcon from '@mui/icons-material/ErrorOutlined'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircleOutlined'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { GradeAnswerResponse, MeleteGrade } from '@atlas/shared'

// The verdict is shown as text and an icon as well as a colour.
const VERDICTS = {
  correct: { label: 'Correct', color: 'success', icon: <CheckCircleIcon /> },
  partial: { label: 'Partly right', color: 'warning', icon: <RemoveCircleIcon /> },
  incorrect: { label: 'Not right', color: 'error', icon: <ErrorIcon /> },
} as const

interface GradeFeedbackProps {
  result: GradeAnswerResponse
}

function Points( { title, items }: { title: string, items: string[] } ): ReactElement | null {
  if( items.length === 0 ) {
    return null
  }

  return (
    <>
      <Typography variant="subtitle2" component="h3">{ title }</Typography>
      <List dense disablePadding sx={ { listStyleType: 'disc', pl: 3 } }>
        { items.map( ( item ) => (
          <ListItem key={ item } disablePadding sx={ { display: 'list-item' } }>{ item }</ListItem>
        ) ) }
      </List>
    </>
  )
}

function Graded( { grade }: { grade: MeleteGrade } ): ReactElement {
  const { label, color, icon } = VERDICTS[ grade.verdict ]

  return (
    <Stack spacing={ 1 }>
      <Chip label={ label } color={ color } icon={ icon } sx={ { alignSelf: 'flex-start' } } />
      <Points title="Right" items={ grade.right } />
      <Points title="Missed" items={ grade.missed } />
      <Typography>{ grade.feedback }</Typography>
    </Stack>
  )
}

export function GradeFeedback( { result }: GradeFeedbackProps ): ReactElement {
  if( result.outcome === 'graded' ) {
    return <Graded grade={ result.grade } />
  }

  if( result.outcome === 'skipped' ) {
    return <Typography color="text.secondary">No answer given, so nothing was graded.</Typography>
  }

  return <Alert severity="info">Couldn&apos;t grade this one; rate it yourself.</Alert>
}
