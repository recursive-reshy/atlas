// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteConceptBucket, MeleteGapConcept } from '@atlas/shared'
// App
import { SuggestResources } from '#src/components/SuggestResources'

interface GapConceptRowProps {
  concept: MeleteGapConcept
  isNext: boolean
}

// The state is said in words as well as shown by colour
const BUCKET_LABELS: Record< MeleteConceptBucket, string > = {
  uncovered: 'Not covered',
  weak: 'Weak',
  solid: 'Solid',
}

const BUCKET_COLORS = { uncovered: 'default', weak: 'warning', solid: 'success' } as const

const plural = ( count: number, word: string ): string => {
  return `${ count } ${ word }${ count === 1 ? '' : 's' }`
}

export function GapConceptRow( { concept, isNext }: GapConceptRowProps ): ReactElement {
  const { id, name, description, bucket, mastery, note_count: notes, question_count: questions }
    = concept
  const percent = Math.round( mastery * 100 )

  return (
    <Stack spacing={ 0.5 } sx={ { py: 1 } }>
      <Stack
        direction="row"
        spacing={ 1 }
        useFlexGap
        sx={ { alignItems: 'center', flexWrap: 'wrap' } }
      >
        <Typography sx={ { overflowWrap: 'anywhere' } }>{ name }</Typography>
        <Chip size="small" color={ BUCKET_COLORS[ bucket ] } label={ BUCKET_LABELS[ bucket ] } />
        { isNext && <Chip size="small" color="primary" variant="outlined" label="Next" /> }
      </Stack>
      { description !== '' && (
        <Typography variant="body2" color="text.secondary">{ description }</Typography>
      ) }
      { bucket !== 'uncovered' && (
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
          <LinearProgress
            variant="determinate"
            value={ percent }
            aria-label={ `${ name } mastery` }
            sx={ { flexGrow: 1, height: 8, borderRadius: 1 } }
          />
          <Typography variant="body2">{ `${ percent }%` }</Typography>
        </Stack>
      ) }
      <Typography variant="caption" color="text.secondary">
        { `${ plural( notes, 'note' ) } · ${ plural( questions, 'question' ) }` }
      </Typography>
      <Stack
        direction="row"
        spacing={ 1 }
        useFlexGap
        sx={ { alignItems: 'center', flexWrap: 'wrap' } }
      >
        { questions > 0 && (
          <Button
            component={ RouterLink }
            to={ `/melete/review?concept=${ id }` }
            size="small"
            aria-label={ `Review ${ name }` }
            sx={ { minHeight: 44 } }
          >
            Review
          </Button>
        ) }
        { bucket !== 'solid' && <SuggestResources conceptId={ id } conceptName={ name } /> }
      </Stack>
    </Stack>
  )
}
