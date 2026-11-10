// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type {
  GradeAnswerResponse,
  MeleteReviewMode,
  RecordReviewBody,
} from '@atlas/shared'
// App
import { useGradeAnswer, useRecordReview } from '#src/features/melete/hooks/useMeleteMutations'
import {
  meleteGradeFixture,
  meleteReviewItemFixture,
  QUESTION_ID,
} from '#src/features/melete/fixtures/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewCard } from './ReviewCard'

vi.mock( '#src/features/melete/hooks/useMeleteMutations' )

interface GradeOptions {
  onSuccess: ( result: GradeAnswerResponse ) => void
  onError: ( error: Error ) => void
}

const mocks = {
  grade: vi.fn< ( variables: unknown, options: GradeOptions ) => void >(),
  record: vi.fn< ( variables: { questionId: string, body: RecordReviewBody } ) => void >(),
  onRated: vi.fn(),
}

const recordedBody = (): RecordReviewBody => mocks.record.mock.calls[ 0 ][ 0 ].body

const GRADED: GradeAnswerResponse = {
  outcome: 'graded',
  grade: meleteGradeFixture(),
  run_id: 7,
}

// The next grade call answers with this; an Error acts like a network failure.
const gradeReturns = ( result: GradeAnswerResponse | Error ): void => {
  mocks.grade.mockImplementation( ( _variables, options ) => {
    if( result instanceof Error ) {
      options.onError( result )
    } else {
      options.onSuccess( result )
    }
  } )
}

const setup = ( mode: MeleteReviewMode, recordState = {} ) => {
  vi.mocked( useRecordReview ).mockReturnValue(
    mutationStub( { mutate: mocks.record, ...recordState } ),
  )
  renderWithClient( <ReviewCard item={ meleteReviewItemFixture() } mode={ mode }
    onRated={ mocks.onRated } /> )

  return userEvent.setup()
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  vi.mocked( useGradeAnswer ).mockReturnValue( mutationStub( { mutate: mocks.grade } ) )
} )

describe( 'ReviewCard typed mode', () => {
  it( 'shows the question and no rating bar before the answer is checked', () => {
    setup( 'typed' )

    expect( screen.getByText( 'What does a type parameter do?' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Next' } ) ).not.toBeInTheDocument()
  } )

  it( 'grades the typed answer, shows the feedback and pre-selects the suggestion', async () => {
    gradeReturns( GRADED )
    const user = setup( 'typed' )

    await user.type( screen.getByRole( 'textbox', { name: 'Your answer' } ), 'a placeholder' )
    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( mocks.grade ).toHaveBeenCalledWith(
      { questionId: QUESTION_ID, body: { answer: 'a placeholder' } },
      expect.anything(),
    )
    expect( screen.getByRole( 'heading', { name: 'Missed' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'It stands for a type chosen by the caller.' ) )
      .toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Hard' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'records the suggested rating with the grade run', async () => {
    gradeReturns( GRADED )
    const user = setup( 'typed' )

    await user.type( screen.getByRole( 'textbox', { name: 'Your answer' } ), 'a placeholder' )
    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    expect( mocks.record ).toHaveBeenCalledWith(
      {
        questionId: QUESTION_ID,
        body: {
          rating: 'hard',
          mode: 'typed',
          answer: 'a placeholder',
          grade_run_id: 7,
          suggested_rating: 'hard',
        },
      },
      expect.objectContaining( { onSuccess: mocks.onRated } ),
    )
  } )

  it( 'records the rating the learner picks instead, still sending the suggestion', async () => {
    gradeReturns( GRADED )
    const user = setup( 'typed' )

    await user.type( screen.getByRole( 'textbox', { name: 'Your answer' } ), 'a placeholder' )
    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Good' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    expect( recordedBody() )
      .toMatchObject( { rating: 'good', suggested_rating: 'hard', grade_run_id: 7 } )
  } )

  it( 'pre-selects Again for a skipped answer and sends no grade run', async () => {
    gradeReturns( { outcome: 'skipped', reason: 'blank' } )
    const user = setup( 'typed' )

    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( screen.getByRole( 'button', { name: 'Again' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )

    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    const body = recordedBody()
    expect( body ).toMatchObject( { rating: 'again', mode: 'typed' } )
    expect( body ).not.toHaveProperty( 'grade_run_id' )
    expect( body ).not.toHaveProperty( 'suggested_rating' )
  } )

  it.each( [
    [ 'a failed grade', { outcome: 'failed', reason: 'Timed out', run_id: 9 } as const ],
    [ 'a network error', new Error( 'Network down' ) ],
  ] )( 'lets the learner rate it themselves after %s', async ( _name, result ) => {
    gradeReturns( result )
    const user = setup( 'typed' )

    await user.type( screen.getByRole( 'textbox', { name: 'Your answer' } ), 'a placeholder' )
    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( screen.getByText( 'Couldn\'t grade this one; rate it yourself.' ) )
      .toBeInTheDocument()
    expect( screen.getByText( 'It stands for a type chosen by the caller.' ) )
      .toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Next' } ) ).toBeDisabled()

    await user.click( screen.getByRole( 'button', { name: 'Easy' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    const body = recordedBody()
    expect( body ).toMatchObject( { rating: 'easy', mode: 'typed' } )
    expect( body ).not.toHaveProperty( 'grade_run_id' )
  } )

  it( 'shows a failed save and keeps the rating so Next can be tried again', async () => {
    gradeReturns( GRADED )
    const user = setup( 'typed', { isError: true, error: new Error( 'Could not save' ) } )

    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not save' )
    expect( screen.getByRole( 'button', { name: 'Hard' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'cannot be rated again while the review is being saved', async () => {
    gradeReturns( GRADED )
    const user = setup( 'typed', { isPending: true } )

    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( screen.getByRole( 'button', { name: 'Next' } ) ).toBeDisabled()
  } )
} )

describe( 'ReviewCard quick mode', () => {
  it( 'has no answer box and hides the answer until it is asked for', () => {
    setup( 'quick' )

    expect( screen.queryByRole( 'textbox' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'It stands for a type chosen by the caller.' ) )
      .not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Next' } ) ).not.toBeInTheDocument()
  } )

  it( 'reveals the answer, then records the rating without grading', async () => {
    const user = setup( 'quick' )

    await user.click( screen.getByRole( 'button', { name: 'Show answer' } ) )

    expect( screen.getByText( 'It stands for a type chosen by the caller.' ) )
      .toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Next' } ) ).toBeDisabled()

    await user.click( screen.getByRole( 'button', { name: 'Good' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    expect( mocks.grade ).not.toHaveBeenCalled()
    const body = recordedBody()
    expect( body ).toEqual( { rating: 'good', mode: 'quick' } )
  } )
} )
