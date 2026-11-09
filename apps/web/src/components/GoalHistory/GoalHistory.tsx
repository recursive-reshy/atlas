// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { GetThemisGoalResponse } from '@atlas/shared'
// App
import { formatDate } from '#src/formatDate'

interface GoalHistoryProps {
  detail: GetThemisGoalResponse
}

const List = ( { title, empty, items }: {
  title: string
  empty: string
  items: string[]
} ): ReactElement => (
  <Stack spacing={ 1 }>
    <Typography component="h2" variant="h6">{ title }</Typography>
    { items.length === 0 && <Typography color="text.secondary">{ empty }</Typography> }
    <Stack component="ul" spacing={ 0.5 } sx={ { m: 0, pl: 2.5 } }>
      { items.map( ( item ) => <Typography component="li" key={ item }>{ item }</Typography> ) }
    </Stack>
  </Stack>
)

// Every metric update or check-in a goal has, newest first; a learning goal has no list
export function GoalHistory( { detail }: GoalHistoryProps ): ReactElement | null {
  const { outcome } = detail

  if( outcome.type === 'metric' ) {
    const unit = outcome.unit === null ? '' : ` ${ outcome.unit }`

    return (
      <List
        title="Updates"
        empty="No updates yet"
        items={ detail.metric_updates.map( ( { value, at, note } ) => {
          const text = `${ value }${ unit } · ${ formatDate( at ) }`

          return note === null ? text : `${ text } · ${ note }`
        } ) }
      />
    )
  }

  if( outcome.type === 'checkin' ) {
    return (
      <List
        title="Check-ins"
        empty="No check-ins yet"
        items={ detail.checkins.map( ( { period_start: start, rating, note } ) => {
          const text = `${ start } · ${ rating } of 5`

          return note === null ? text : `${ text } · ${ note }`
        } ) }
      />
    )
  }

  return null
}
