// React
import type { ReactElement } from 'react'
// Packages
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { ThemisGoalCard } from '@atlas/shared'
// App
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { OutcomeDisplay } from '../OutcomeDisplay'

interface GoalCardProps {
  card: ThemisGoalCard
}

// One active goal: its name, target date, time this period, outcome and linked subjects
export function GoalCard( { card }: GoalCardProps ): ReactElement {
  const { goal, time, outcome, subjects } = card

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={ 1.5 }>
          <Link
            component={ RouterLink }
            to={ `/themis/goals/${ goal.id }` }
            variant="subtitle1"
            sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
          >
            { goal.name }
          </Link>
          <Stack direction="row" spacing={ 2 } sx={ { flexWrap: 'wrap' } }>
            { goal.target_date !== null && (
              <Typography variant="body2" color="text.secondary">
                { `Target ${ goal.target_date }` }
              </Typography>
            ) }
            <Typography variant="body2" color="text.secondary">
              { `${ formatStudyTime( time.seconds ) } this period` }
            </Typography>
          </Stack>
          <OutcomeDisplay outcome={ outcome } />
          { subjects.length > 0 && (
            <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
              { subjects.map( ( { id, name } ) => (
                <Chip key={ id } label={ name } size="small" />
              ) ) }
            </Stack>
          ) }
        </Stack>
      </CardContent>
    </Card>
  )
}
