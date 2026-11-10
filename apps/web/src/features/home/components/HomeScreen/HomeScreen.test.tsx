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
import { overviewFixture } from '#src/features/themis/fixtures/themis.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { useCalendarSync } from '#src/features/themis/hooks/useCalendarSync'
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { HomeScreen } from './HomeScreen'

vi.mock( '#src/features/themis/hooks/useThemisOverview' )
vi.mock( '#src/features/themis/hooks/useCalendarSync' )
vi.mock( '#src/features/themis/api/calendar.api' )

const mockedOverview = vi.mocked( useThemisOverview )

const loaded = ( overrides = {} ) => {
  mockedOverview.mockReturnValue(
    { overview: overviewFixture( overrides ), isLoading: false, error: null },
  )
}

beforeEach( () => {
  window.localStorage.clear()
  mockedOverview.mockReset()
  vi.mocked( useCalendarSync ).mockReset()
} )

describe( 'HomeScreen', () => {
  it( 'has the Home heading and where the time went', () => {
    loaded()
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Home' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Where your time went' } ) ).toBeInTheDocument()
  } )

  it( 'asks for the period in the URL, week by default', () => {
    loaded()
    renderWithClient( <HomeScreen />, { route: '/?period=quarter' } )

    expect( mockedOverview ).toHaveBeenCalledWith( 'quarter' )
  } )

  it( 'falls back to the week for a period it does not know', () => {
    loaded()
    renderWithClient( <HomeScreen />, { route: '/?period=decade' } )

    expect( mockedOverview ).toHaveBeenCalledWith( 'week' )
  } )

  it( 'changes the period in the URL', async () => {
    loaded()
    const { location } = renderWithClient( <HomeScreen /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Month' } ) )

    expect( location().search ).toBe( '?period=month' )
  } )

  it( 'shows the drafts card when drafts wait on a connected calendar', () => {
    loaded( { calendar_status: 'connected', calendar_drafts: 3 } )
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'link', { name: '3 calendar drafts to review' } ) )
      .toHaveAttribute( 'href', '/themis/calendar' )
    expect( screen.queryByRole( 'button', { name: 'Connect Google Calendar' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'invites a user without a calendar to connect one', () => {
    loaded( { calendar_status: 'not_connected' } )
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'button', { name: 'Connect Google Calendar' } ) ).toBeInTheDocument()
  } )

  it( 'syncs the calendar only when it is connected', () => {
    loaded( { calendar_status: 'connected' } )
    renderWithClient( <HomeScreen /> )

    expect( useCalendarSync ).toHaveBeenCalledWith( true )
  } )

  it( 'does not sync when the calendar is not connected', () => {
    loaded( { calendar_status: 'not_connected' } )
    renderWithClient( <HomeScreen /> )

    expect( useCalendarSync ).toHaveBeenCalledWith( false )
  } )

  it( 'shows the page while the overview loads, without waiting for the sync', () => {
    mockedOverview.mockReturnValue( { overview: null, isLoading: true, error: null } )
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Home' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error when the overview cannot load', () => {
    mockedOverview.mockReturnValue(
      { overview: null, isLoading: false, error: 'Could not reach the server' },
    )
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'points a user with no areas to Themis instead of an empty chart', () => {
    loaded( { areas: [] } )
    renderWithClient( <HomeScreen /> )

    expect( screen.getByRole( 'link', { name: 'Add an area in Themis' } ) )
      .toHaveAttribute( 'href', '/themis' )
    expect( screen.queryByRole( 'heading', { name: 'Where your time went' } ) )
      .not.toBeInTheDocument()
  } )
} )
