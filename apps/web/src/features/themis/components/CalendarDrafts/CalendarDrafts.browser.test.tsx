// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
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
import { page } from 'vitest/browser'
// App
import { calendarFixture } from '#src/features/themis/fixtures/calendar.fixture'
import { draftFixture } from '#src/features/themis/fixtures/calendarReview.fixture'
import { getCalendar, listDrafts, syncCalendar } from '#src/features/themis/api/calendar.api'
import { createQueryClient } from '#src/queryClient'
import { SUBJECT_ID } from '#src/features/themis/fixtures/themis.fixture'
import { theme } from '#src/theme'
import { CalendarDrafts } from './CalendarDrafts'

vi.mock( '#src/features/themis/api/calendar.api' )
vi.mock( '#src/features/themis/hooks/useTimeTargets', () => ( {
  useTimeTargets: () => ( {
    subjects: [ { id: SUBJECT_ID, name: `Data ${ 'Supercalifragilistic'.repeat( 2 ) }` } ],
    goals: [],
  } ),
} ) )

const MIN_TAP = 44
const MODES = [ 'light', 'dark' ] as const
const LONG_TITLE = `Weekly ${ 'Supercalifragilisticexpialidocious'.repeat( 4 ) } planning`

beforeEach( () => {
  vi.mocked( getCalendar ).mockResolvedValue( calendarFixture() )
  vi.mocked( syncCalendar ).mockResolvedValue(
    { added: 0, updated: 0, removed: 0, drafts: 0, skipped: true },
  )
  vi.mocked( listDrafts ).mockResolvedValue( [
    draftFixture( {
      title: LONG_TITLE,
      subject_id: SUBJECT_ID,
      assigned_by: 'rule',
      rule_phrase: 'planning',
      overlap_seconds: 1500,
      counts_seconds: 2100,
    } ),
  ] )
} )

describe.each( MODES )( 'CalendarDrafts on a phone, %s', ( mode ) => {
  it( 'fits 375 px wide with a long title, and every control is at least 44 px', async () => {
    await page.viewport( 375, 812 )
    render(
      <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
        <CssBaseline />
        <QueryClientProvider client={ createQueryClient() }>
          <MemoryRouter><CalendarDrafts onMakeRule={ vi.fn() } /></MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    )

    await screen.findByText( LONG_TITLE )

    const { scrollWidth, clientWidth } = document.documentElement

    expect( scrollWidth ).toBeLessThanOrEqual( clientWidth )

    const buttons = [ 'Approve', 'Dismiss', 'Make a rule', 'Sync now' ]
      .map( ( name ) => screen.getByRole( 'button', { name } ) )

    buttons.forEach( ( button ) => {
      expect( button.getBoundingClientRect().height ).toBeGreaterThanOrEqual( MIN_TAP )
    } )
    const select = screen.getByRole( 'combobox', { name: 'Counts toward' } )

    expect( select.getBoundingClientRect().height ).toBeGreaterThanOrEqual( MIN_TAP )
    expect( screen.getByText( LONG_TITLE ).getBoundingClientRect().right )
      .toBeLessThanOrEqual( window.innerWidth )
  } )
} )
