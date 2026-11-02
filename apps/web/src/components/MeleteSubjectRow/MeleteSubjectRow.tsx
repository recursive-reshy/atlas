// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteSubject } from '@atlas/shared'

interface MeleteSubjectRowProps {
  subject: MeleteSubject
}

export function MeleteSubjectRow( { subject }: MeleteSubjectRowProps ): ReactElement {
  const hasWork = subject.due_count + subject.new_remaining_today > 0

  return (
    <Paper variant="outlined" sx={ { p: 2 } }>
      <Stack
        direction="row"
        spacing={ 2 }
        sx={ { alignItems: 'center', justifyContent: 'space-between' } }
      >
        <Stack sx={ { minWidth: 0 } }>
          <Link
            component={ RouterLink }
            to={ `/melete/subjects/${ subject.id }` }
            variant="subtitle1"
            underline="hover"
          >
            { subject.name }
          </Link>
          <Typography variant="body2" color="text.secondary">
            { `${ subject.due_count } due · ${ subject.new_remaining_today } new`
              + ` · ${ subject.enrolled_count } of ${ subject.note_count } enrolled` }
          </Typography>
        </Stack>
        <Button
          component={ RouterLink }
          to={ `/melete/review?subject=${ subject.id }` }
          variant="outlined"
          disabled={ !hasWork }
          aria-label={ `Review ${ subject.name }` }
          sx={ { minHeight: 44, flexShrink: 0 } }
        >
          Review
        </Button>
      </Stack>
    </Paper>
  )
}
