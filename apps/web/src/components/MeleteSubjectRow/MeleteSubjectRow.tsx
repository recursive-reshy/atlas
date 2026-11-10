// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteSubject } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { LEVELS } from '#src/syllabusLevels'

interface MeleteSubjectRowProps {
  subject: MeleteSubject
}

const percent = ( value: number ): number => Math.round( value * 100 )

function Bar( { subject, label, value }: {
  subject: string
  label: string
  value: number
} ): ReactElement {
  return (
    <Stack spacing={ 0.25 }>
      <Typography variant="caption">{ `${ label } ${ percent( value ) }%` }</Typography>
      <LinearProgress
        variant="determinate"
        value={ percent( value ) }
        aria-label={ `${ subject } ${ label.toLowerCase() }` }
        sx={ { height: 6, borderRadius: 1 } }
      />
    </Stack>
  )
}

export function MeleteSubjectRow( { subject }: MeleteSubjectRowProps ): ReactElement {
  const hasWork = subject.due_count + subject.new_remaining_today > 0
  const isApproved = subject.syllabus_status === 'approved'
  const level = LEVELS.find( ( { value } ) => value === subject.target_level )?.label ?? null

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
          <Typography variant="body2" color="text.secondary">
            { `${ subject.due_today } due today`
              + ` · ${ formatStudyTime( subject.seconds_this_week ) } this week` }
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
      { isApproved && level !== null && (
        <Typography variant="body2" sx={ { pt: 1 } }>{ level }</Typography>
      ) }
      { isApproved && subject.coverage !== null && subject.mastery !== null && (
        <Stack spacing={ 1 } sx={ { pt: 1 } }>
          <Bar subject={ subject.name } label="Coverage" value={ subject.coverage } />
          <Bar subject={ subject.name } label="Mastery" value={ subject.mastery } />
        </Stack>
      ) }
      { !isApproved && (
        <Button
          component={ RouterLink }
          to={ `/melete/subjects/${ subject.id }?tab=syllabus` }
          size="small"
          sx={ { minHeight: 44, mt: 0.5 } }
        >
          Set up syllabus
        </Button>
      ) }
    </Paper>
  )
}
