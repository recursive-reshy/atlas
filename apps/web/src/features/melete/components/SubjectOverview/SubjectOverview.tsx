// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { GetMeleteGapsResponse } from '@atlas/shared'
// App
import { GapConceptRow } from '../GapConceptRow'
import { useMeleteGaps } from '#src/features/melete/hooks/useMeleteGaps'

interface SubjectOverviewProps {
  subjectId: string
}

const percent = ( value: number ): number => Math.round( value * 100 )

function Bar( { label, value }: { label: string, value: number } ): ReactElement {
  return (
    <Stack spacing={ 0.5 }>
      <Typography variant="body2">{ `${ label } ${ percent( value ) }%` }</Typography>
      <LinearProgress
        variant="determinate"
        value={ percent( value ) }
        aria-label={ label }
        sx={ { height: 8, borderRadius: 1 } }
      />
    </Stack>
  )
}

function NextStep( { gaps }: { gaps: GetMeleteGapsResponse } ): ReactElement {
  const { next_step: step } = gaps

  if( step.kind === 'none' ) {
    return <Typography>Every concept is solid for now.</Typography>
  }

  const name = gaps.sections.flatMap( ( { concepts } ) => concepts )
    .find( ( { id } ) => id === step.concept_id )?.name ?? ''

  return (
    <Stack spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
      <Typography>{ `Next: ${ step.kind } “${ name }”` }</Typography>
      { step.kind === 'review' && (
        <Button
          component={ RouterLink }
          to={ `/melete/review?concept=${ step.concept_id }` }
          variant="contained"
          sx={ { minHeight: 44 } }
        >
          Review this concept
        </Button>
      ) }
    </Stack>
  )
}

// Coverage, mastery and what to do next, over the concepts of an approved syllabus
export function SubjectOverview( { subjectId }: SubjectOverviewProps ): ReactElement {
  const { gaps, isLoading, error } = useMeleteGaps( subjectId )

  if( isLoading ) {
    return <Typography role="status">Loading the syllabus…</Typography>
  }

  if( gaps === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the syllabus' }</Alert>
  }

  if( gaps.coverage === null || gaps.mastery === null ) {
    return <Typography color="text.secondary">The syllabus has no concepts yet.</Typography>
  }

  return (
    <Stack spacing={ 3 }>
      <Stack spacing={ 1.5 }>
        <Bar label="Coverage" value={ gaps.coverage } />
        <Bar label="Mastery" value={ gaps.mastery } />
      </Stack>
      <NextStep gaps={ gaps } />
      { gaps.sections.map( ( section ) => (
        <Stack key={ section.id } component="section" aria-label={ section.name } spacing={ 0.5 }>
          <Typography variant="h6" component="h3">{ section.name }</Typography>
          { section.coverage !== null && section.mastery !== null && (
            <Typography variant="body2" color="text.secondary">
              { `Coverage ${ percent( section.coverage ) }%`
                + ` · Mastery ${ percent( section.mastery ) }%` }
            </Typography>
          ) }
          { section.concepts.map( ( concept ) => (
            <GapConceptRow
              key={ concept.id }
              concept={ concept }
              isNext={ gaps.next_step.kind !== 'none' && gaps.next_step.concept_id === concept.id }
            />
          ) ) }
        </Stack>
      ) ) }
    </Stack>
  )
}
