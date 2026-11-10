// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { page, userEvent } from 'vitest/browser'
// App
import {
  useDropQuestion,
  useGradeAnswer,
  useRecordReview,
} from '#src/hooks/useMeleteMutations'
import { useNextReview } from '#src/hooks/useNextReview'
import { useSettings } from '#src/hooks/useSettings'
import { createQueryClient } from '#src/queryClient'
import { settingsState } from '#src/test-support/hookStates'
import { meleteQuestionFixture, meleteReviewItemFixture } from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { theme } from '#src/theme'
import { MeleteReview } from './MeleteReview'

vi.mock( '#src/hooks/useNextReview' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useMeleteMutations' )

const MIN_TAP_HEIGHT = 44
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

// Long enough that the page scrolls on a phone, with one word too long to wrap.
const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat( 4 )
const SENTENCE = 'A type parameter stands for a type chosen by the caller. '
const LONG_ANSWER = `${ SENTENCE.repeat( 40 ) }${ LONG_WORD }`
const LONG_PASSAGE = 'A type parameter is a placeholder for a type. '.repeat( 40 )

const renderReview = ( mode: ( typeof MODES )[ number ] ): void => {
  const router = createMemoryRouter(
    [ { path: '/melete/review', element: <MeleteReview /> } ],
    { initialEntries: [ '/melete/review' ] },
  )

  render(
    <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
      <CssBaseline />
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

const scrollbarFree = (): boolean => {
  const { scrollWidth, clientWidth } = document.documentElement

  return scrollWidth <= clientWidth
}

beforeEach( () => {
  const item = meleteReviewItemFixture( {
    question: meleteQuestionFixture( { answer: LONG_ANSWER, passage: LONG_PASSAGE } ),
  } )

  vi.mocked( useNextReview ).mockReturnValue(
    { item, counts: { due: 6, new_remaining: 3, learning_soon: 0 }, isLoading: false, error: null },
  )
  vi.mocked( useSettings ).mockReturnValue( settingsState( {
    settings: { ...settingsFixture().settings, melete_review_mode: 'quick' },
  } ) )
  vi.mocked( useGradeAnswer ).mockReturnValue( mutationStub() )
  vi.mocked( useRecordReview ).mockReturnValue( mutationStub() )
  vi.mocked( useDropQuestion ).mockReturnValue( mutationStub() )
  window.scrollTo( 0, 0 )
} )

describe.each( SIZES )( 'MeleteReview at $name size', ( { width, height } ) => {
  it.each( MODES )( 'has no sideways scroll and a reachable rating bar, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderReview( mode )

    await userEvent.click( screen.getByRole( 'button', { name: 'Show answer' } ) )
    await expect.poll( () => screen.queryByRole( 'button', { name: 'Next' } ) ).not.toBeNull()

    expect( scrollbarFree() ).toBe( true )
    expect( document.documentElement.scrollHeight ).toBeGreaterThan( height )

    // Scrolled to the top of a page taller than the window, the bar is still on screen.
    window.scrollTo( 0, 0 )
    const buttons = [ 'Again', 'Hard', 'Good', 'Easy', 'Next' ]
      .map( ( name ) => screen.getByRole( 'button', { name } ) )

    for( const button of buttons ) {
      const box = button.getBoundingClientRect()

      expect( box.height ).toBeGreaterThanOrEqual( MIN_TAP_HEIGHT )
      expect( box.bottom ).toBeLessThanOrEqual( window.innerHeight )
      expect( box.right ).toBeLessThanOrEqual( window.innerWidth )
    }
  } )

  it( 'shows the dark and light themes differently, so the checks above cover both', async () => {
    await page.viewport( width, height )
    renderReview( 'dark' )

    const dark = getComputedStyle( document.body ).backgroundColor

    document.body.innerHTML = ''
    renderReview( 'light' )

    await expect.poll( () => getComputedStyle( document.body ).backgroundColor )
      .not.toBe( dark )
  } )
} )
