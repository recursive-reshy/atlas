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
import {
  useDropQuestion,
  useGradeAnswer,
  useRecordReview,
} from '#src/hooks/useMeleteMutations'
import { useNextReview } from '#src/hooks/useNextReview'
import { useSettings } from '#src/hooks/useSettings'
import {
  meleteReviewItemFixture,
  QUESTION_ID,
  SUBJECT_ID,
} from '#src/test-support/melete.fixture'
import { settingsState } from '#src/test-support/hookStates'
import { settingsFixture } from '#src/test-support/summarizer.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteReview } from './MeleteReview'

vi.mock( '#src/hooks/useNextReview' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useMeleteMutations' )

const mocks = {
  next: vi.mocked( useNextReview ),
  drop: vi.fn(),
  record: vi.fn< ( variables: unknown, options: { onSuccess: () => void } ) => void >(),
}
const COUNTS = { due: 6, new_remaining: 3, learning_soon: 0 }

const show = ( overrides = {} ): void => {
  mocks.next.mockReturnValue( {
    item: meleteReviewItemFixture(),
    counts: COUNTS,
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const ROUTE = { route: `/melete/review?subject=${ SUBJECT_ID }`, path: '/melete/review' }
const NEXT_QUESTION_ID = '9f5a2c6b-0e8d-4b4f-a1a0-5b6c7d8e9f0a'

const renderPage = ( route = ROUTE.route ) => {
  renderWithClient( <MeleteReview />, { route, path: ROUTE.path } )

  return userEvent.setup()
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => 'mockReset' in mock && mock.mockReset() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useGradeAnswer ).mockReturnValue( mutationStub() )
  vi.mocked( useRecordReview ).mockReturnValue( mutationStub( { mutate: mocks.record } ) )
  vi.mocked( useDropQuestion ).mockReturnValue( mutationStub( { mutate: mocks.drop } ) )
  show()
} )

describe( 'MeleteReview', () => {
  it( 'reviews the subject in the URL, or everything without one', () => {
    renderPage()
    expect( mocks.next ).toHaveBeenCalledWith( SUBJECT_ID, null )
  } )

  it( 'reviews every subject when the URL names none', () => {
    renderPage( '/melete/review' )
    expect( mocks.next ).toHaveBeenCalledWith( null, null )
  } )

  it( 'reviews one concept when the URL names it', () => {
    renderPage( '/melete/review?concept=c-1' )
    expect( mocks.next ).toHaveBeenCalledWith( null, 'c-1' )
  } )

  it( 'shows the subject, the question and what is left', () => {
    renderPage()

    expect( screen.getByText( 'TypeScript' ) ).toBeInTheDocument()
    expect( screen.getByText( '0 done · 9 left' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'What does a type parameter do?' } ) )
      .toBeInTheDocument()
  } )

  it( 'starts in the mode saved in Settings', () => {
    const { settings } = settingsFixture()
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { settings: { ...settings, melete_review_mode: 'quick' } } ),
    )
    renderPage()

    expect( screen.getByRole( 'button', { name: 'Show answer' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'textbox' ) ).not.toBeInTheDocument()
  } )

  it( 'counts reviews done in this session', async () => {
    mocks.record.mockImplementation( ( _variables, options ) => options.onSuccess() )
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( {
        settings: { ...settingsFixture().settings, melete_review_mode: 'quick' },
      } ),
    )
    const user = renderPage()

    await user.click( screen.getByRole( 'button', { name: 'Show answer' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Good' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Next' } ) )

    expect( screen.getByText( '1 done · 9 left' ) ).toBeInTheDocument()
  } )

  it( 'switches mode for the next question, keeping this one as it is', async () => {
    const view = renderWithClient( <MeleteReview />, ROUTE )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Quick' } ) )

    expect( screen.getByRole( 'button', { name: 'Quick' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'textbox', { name: 'Your answer' } ) ).toBeInTheDocument()

    const item = meleteReviewItemFixture()
    show( { item: { ...item, question: { ...item.question, id: NEXT_QUESTION_ID } } } )
    view.rerender( <MeleteReview /> )

    expect( screen.getByRole( 'button', { name: 'Show answer' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'textbox' ) ).not.toBeInTheDocument()
  } )

  it( 'drops the question from the menu', async () => {
    const user = renderPage()

    await user.click( screen.getByRole( 'button', { name: 'More' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Drop question' } ) )

    expect( mocks.drop ).toHaveBeenCalledWith( QUESTION_ID )
  } )

  it( 'says it is all done and links back to Today', () => {
    show( { item: null, counts: { due: 0, new_remaining: 0, learning_soon: 0 } } )
    renderPage()

    expect( screen.getByText( 'All done for now' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Back to Today' } ) )
      .toHaveAttribute( 'href', '/melete' )
  } )

  it( 'shows that it is loading', () => {
    show( { item: null, counts: null, isLoading: true } )
    renderPage()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading review…' )
  } )

  it( 'shows an error from the server', () => {
    show( { item: null, counts: null, error: 'Choose a learning root first' } )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Choose a learning root first' )
  } )
} )
