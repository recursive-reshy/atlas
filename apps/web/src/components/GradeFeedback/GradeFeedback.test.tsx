// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// Shared
import type { GradeAnswerResponse } from '@atlas/shared'
// App
import { meleteGradeFixture } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GradeFeedback } from './GradeFeedback'

const show = ( result: GradeAnswerResponse ): void => {
  renderWithClient( <GradeFeedback result={ result } /> )
}

describe( 'GradeFeedback', () => {
  it( 'shows the verdict, what was right and missed, and the feedback', () => {
    show( { outcome: 'graded', grade: meleteGradeFixture(), run_id: 7 } )

    expect( screen.getByText( 'Partly right' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Right' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'It is a placeholder for a type' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Missed' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'The caller chooses the type' ) ).toBeInTheDocument()
    expect( screen.getByText( 'You have the idea but not who picks the type.' ) )
      .toBeInTheDocument()
  } )

  it.each( [
    [ 'correct', 'Correct' ],
    [ 'incorrect', 'Not right' ],
  ] as const )( 'labels a %s answer', ( verdict, label ) => {
    show( { outcome: 'graded', grade: meleteGradeFixture( { verdict } ), run_id: 7 } )

    expect( screen.getByText( label ) ).toBeInTheDocument()
  } )

  it( 'leaves out an empty Right or Missed list', () => {
    show( {
      outcome: 'graded',
      grade: meleteGradeFixture( { verdict: 'correct', missed: [] } ),
      run_id: 7,
    } )

    expect( screen.queryByRole( 'heading', { name: 'Missed' } ) ).not.toBeInTheDocument()
  } )

  it( 'says a blank answer was skipped', () => {
    show( { outcome: 'skipped', reason: 'blank' } )

    expect( screen.getByText( 'No answer given, so nothing was graded.' ) ).toBeInTheDocument()
  } )

  it( 'tells the learner to rate it themselves when grading failed', () => {
    show( { outcome: 'failed', reason: 'Timed out', run_id: null } )

    expect( screen.getByText( 'Couldn\'t grade this one; rate it yourself.' ) )
      .toBeInTheDocument()
  } )
} )
