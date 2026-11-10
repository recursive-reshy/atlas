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
// App
import { useAnswerCheckin } from '#src/features/themis/hooks/useThemisMutations'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CHECKIN_GOAL_ID, dueFixture } from '#src/features/themis/fixtures/themis.fixture'
import { CheckinsDue } from './CheckinsDue'

vi.mock( '#src/features/themis/hooks/useThemisMutations' )

const mutate = vi.fn()

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useAnswerCheckin ).mockReturnValue(
    mutationStub< ReturnType< typeof useAnswerCheckin > >( { mutate } ),
  )
} )

describe( 'CheckinsDue', () => {
  it( 'renders nothing when no check-in is due', () => {
    const { container } = renderWithClient( <CheckinsDue due={ [] } /> )

    expect( container ).toBeEmptyDOMElement()
  } )

  it( 'shows the goal, its area and the period it covers', () => {
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    expect( screen.getByRole( 'heading', { name: 'Check-ins due' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Time with family' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Financial · week of 2026-10-26 to 2026-11-01' ) )
      .toBeInTheDocument()
  } )

  it( 'has five rating buttons', () => {
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    for( const rating of [ 1, 2, 3, 4, 5 ] ) {
      expect( screen.getByRole( 'button', { name: `Rate ${ rating } out of 5` } ) )
        .toBeInTheDocument()
    }
  } )

  it( 'answers in place with the chosen rating', async () => {
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Rate 4 out of 5' } ) )

    expect( mutate ).toHaveBeenCalledWith( {
      goalId: CHECKIN_GOAL_ID,
      body: { period_start: '2026-10-26', rating: 4 },
    } )
  } )

  it( 'sends the note typed before the rating, trimmed', async () => {
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    await userEvent.type(
      screen.getByRole( 'textbox', { name: 'Note (optional)' } ),
      '  Good week ',
    )
    await userEvent.click( screen.getByRole( 'button', { name: 'Rate 5 out of 5' } ) )

    expect( mutate ).toHaveBeenCalledWith( {
      goalId: CHECKIN_GOAL_ID,
      body: { period_start: '2026-10-26', rating: 5, note: 'Good week' },
    } )
  } )

  it( 'shows the server\'s message when the answer is refused', () => {
    vi.mocked( useAnswerCheckin ).mockReturnValue(
      mutationStub< ReturnType< typeof useAnswerCheckin > >( {
        error: new Error( 'Already answered' ),
        isError: true,
      } ),
    )
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Already answered' )
  } )

  it( 'disables the buttons while an answer is being sent', () => {
    vi.mocked( useAnswerCheckin ).mockReturnValue(
      mutationStub< ReturnType< typeof useAnswerCheckin > >( { isPending: true } ),
    )
    renderWithClient( <CheckinsDue due={ [ dueFixture() ] } /> )

    expect( screen.getByRole( 'button', { name: 'Rate 3 out of 5' } ) ).toBeDisabled()
  } )
} )
