// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisCheckinDue } from '@atlas/shared'
// App
import { useAnswerCheckin } from '#src/features/themis/hooks/useThemisMutations'

interface CheckinsDueProps {
  due: ThemisCheckinDue[]
}

const RATINGS = [ 1, 2, 3, 4, 5 ] as const

function CheckinCard( { item }: { item: ThemisCheckinDue } ): ReactElement {
  const [ note, setNote ] = useState( '' )
  const answer = useAnswerCheckin()
  const trimmed = note.trim()
  const unit = item.cadence === 'weekly' ? 'week' : 'month'

  const handleRate = ( rating: number ): void => {
    answer.mutate( {
      goalId: item.goal_id,
      body: {
        period_start: item.period_start,
        rating,
        ...( trimmed === '' ? {} : { note: trimmed } ),
      },
    } )
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={ 1.5 }>
          <div>
            <Typography variant="subtitle1">{ item.goal_name }</Typography>
            <Typography variant="body2" color="text.secondary">
              { `${ item.area_name } · ${ unit } of ` }
              { `${ item.period_start } to ${ item.period_end }` }
            </Typography>
          </div>
          <TextField
            label="Note (optional)"
            size="small"
            value={ note }
            onChange={ ( event ) => setNote( event.target.value ) }
            slotProps={ { htmlInput: { maxLength: 500 } } }
          />
          <Stack direction="row" spacing={ 1 }>
            { RATINGS.map( ( rating ) => (
              <Button
                key={ rating }
                variant="outlined"
                aria-label={ `Rate ${ rating } out of 5` }
                disabled={ answer.isPending }
                onClick={ () => handleRate( rating ) }
                sx={ { minHeight: 44, minWidth: 44 } }
              >
                { rating }
              </Button>
            ) ) }
          </Stack>
          { answer.error && <Alert severity="error">{ answer.error.message }</Alert> }
        </Stack>
      </CardContent>
    </Card>
  )
}

// Answered in place: type a note if you like, then tap the rating (ADR 0092)
export function CheckinsDue( { due }: CheckinsDueProps ): ReactElement | null {
  if( due.length === 0 ) {
    return null
  }

  return (
    <Stack spacing={ 1.5 }>
      <Typography component="h2" variant="h6">Check-ins due</Typography>
      { due.map( ( item ) => <CheckinCard key={ item.goal_id } item={ item } /> ) }
    </Stack>
  )
}
