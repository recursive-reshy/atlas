// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type {
  GradeAnswerResponse,
  MeleteRating,
  MeleteReviewItem,
  MeleteReviewMode,
  RecordReviewBody,
} from '@atlas/shared'
// App
import { useGradeAnswer, useRecordReview } from '#src/hooks/useMeleteMutations'
import { GradeFeedback } from '../GradeFeedback'
import { RatingBar } from '../RatingBar'
import { ReferenceAnswer } from '../ReferenceAnswer'
import { TypedAnswer } from '../TypedAnswer'

interface ReviewCardProps {
  item: MeleteReviewItem
  // The mode this question is answered in; a change in the header applies from the next one.
  mode: MeleteReviewMode
  onRated: () => void
}

// What the learner is shown to start from once the answer has been checked.
const preselected = ( result: GradeAnswerResponse ): MeleteRating | null => {
  if( result.outcome === 'graded' ) {
    return result.grade.suggested_rating
  }

  return result.outcome === 'skipped' ? 'again' : null
}

const reviewBody = (
  rating: MeleteRating,
  mode: MeleteReviewMode,
  answer: string,
  result: GradeAnswerResponse | null,
): RecordReviewBody => {
  if( mode === 'quick' ) {
    return { rating, mode }
  }

  if( result?.outcome === 'graded' ) {
    return {
      rating,
      mode,
      answer,
      grade_run_id: result.run_id,
      suggested_rating: result.grade.suggested_rating,
    }
  }

  return { rating, mode, answer }
}

export function ReviewCard( { item, mode: startMode, onRated }: ReviewCardProps ): ReactElement {
  const { question, obsidian_url: obsidianUrl } = item
  const grade = useGradeAnswer()
  const record = useRecordReview()
  const [ mode ] = useState( startMode )
  const [ answer, setAnswer ] = useState( '' )
  const [ result, setResult ] = useState< GradeAnswerResponse | null >( null )
  const [ isRevealed, setIsRevealed ] = useState( false )
  const [ rating, setRating ] = useState< MeleteRating | null >( null )
  const isTyped = mode === 'typed'
  const isAnswerShown = isTyped ? result !== null : isRevealed

  const handleCheck = (): void => {
    const show = ( next: GradeAnswerResponse ): void => {
      setResult( next )
      setRating( preselected( next ) )
    }

    grade.mutate(
      { questionId: question.id, body: { answer } },
      {
        onSuccess: show,
        // A network error must not block the review either.
        onError: ( error ) => show( { outcome: 'failed', reason: error.message, run_id: null } ),
      },
    )
  }

  const handleConfirm = ( confirmed: MeleteRating ): void => {
    record.mutate(
      { questionId: question.id, body: reviewBody( confirmed, mode, answer, result ) },
      { onSuccess: onRated },
    )
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h2" sx={ { overflowWrap: 'anywhere' } }>
        { question.prompt }
      </Typography>
      { isTyped && (
        <TypedAnswer
          value={ answer }
          isChecked={ result !== null }
          isChecking={ grade.isPending }
          onChange={ setAnswer }
          onCheck={ handleCheck }
        />
      ) }
      { !isTyped && !isRevealed && (
        <Button
          variant="contained"
          sx={ { minHeight: 48 } }
          onClick={ () => setIsRevealed( true ) }
        >
          Show answer
        </Button>
      ) }
      { isTyped && result !== null && <GradeFeedback result={ result } /> }
      { isAnswerShown && (
        <ReferenceAnswer
          answer={ question.answer }
          passage={ question.passage }
          obsidianUrl={ obsidianUrl }
        />
      ) }
      { record.isError && <Alert severity="error">{ record.error?.message }</Alert> }
      { isAnswerShown && (
        <RatingBar
          selected={ rating }
          isDisabled={ record.isPending }
          onSelect={ setRating }
          onConfirm={ handleConfirm }
        />
      ) }
    </Stack>
  )
}
