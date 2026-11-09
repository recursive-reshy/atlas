// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useSearchParams } from 'react-router'
// Shared
import type { MeleteReviewMode } from '@atlas/shared'
// App
import { useDropQuestion } from '#src/hooks/useMeleteMutations'
import { useNextReview } from '#src/hooks/useNextReview'
import { useSettings } from '#src/hooks/useSettings'
import { ReviewCard } from '../ReviewCard'
import { ReviewHeader } from '../ReviewHeader'

const COLUMN_SX = { width: '100%', maxWidth: '40rem', mx: 'auto' } as const

export function MeleteReview(): ReactElement {
  const [ params ] = useSearchParams()
  const { item, counts, isLoading, error } = useNextReview(
    params.get( 'subject' ),
    params.get( 'concept' ),
  )
  const { settings, isLoading: isLoadingSettings } = useSettings()
  const dropQuestion = useDropQuestion()
  const [ done, setDone ] = useState( 0 )
  const [ chosenMode, setChosenMode ] = useState< MeleteReviewMode | null >( null )
  const mode = chosenMode ?? settings?.melete_review_mode ?? 'typed'

  if( isLoading || isLoadingSettings ) {
    return <Typography role="status">Loading review…</Typography>
  }

  if( error !== null ) {
    return <Alert severity="error">{ error }</Alert>
  }

  if( item === null ) {
    return (
      <Stack spacing={ 2 } sx={ COLUMN_SX }>
        <Typography variant="h5" component="h2">All done for now</Typography>
        <Button
          component={ RouterLink }
          to="/melete"
          variant="contained"
          sx={ { alignSelf: 'flex-start', minHeight: 44 } }
        >
          Back to Today
        </Button>
      </Stack>
    )
  }

  const left = counts === null ? 0 : counts.due + counts.new_remaining + counts.learning_soon

  return (
    <Stack spacing={ 2 } sx={ COLUMN_SX }>
      <ReviewHeader
        subjectName={ item.note.subject_name }
        done={ done }
        left={ left }
        mode={ mode }
        isBusy={ dropQuestion.isPending }
        onModeChange={ setChosenMode }
        onDrop={ () => dropQuestion.mutate( item.question.id ) }
      />
      { dropQuestion.isError && <Alert severity="error">{ dropQuestion.error?.message }</Alert> }
      <ReviewCard
        key={ item.question.id }
        item={ item }
        mode={ mode }
        onRated={ () => setDone( ( count ) => count + 1 ) }
      />
    </Stack>
  )
}
