// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  calendarChoicesFixture,
  calendarFixture,
} from '#src/features/themis/fixtures/calendar.fixture'
import {
  disconnectCalendar,
  getCalendar,
  listCalendars,
  startCalendarConnect,
  syncCalendar,
} from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarSettings } from './CalendarSettings'

vi.mock( '#src/features/themis/api/calendar.api' )

const assign = vi.fn()

beforeEach( () => {
  vi.resetAllMocks()
  vi.stubGlobal( 'location', { assign } )
  vi.mocked( getCalendar ).mockResolvedValue( calendarFixture() )
  vi.mocked( listCalendars ).mockResolvedValue( calendarChoicesFixture() )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'CalendarSettings', () => {
  it( 'has a Google Calendar heading and the connection', async () => {
    renderWithClient( <CalendarSettings /> )

    expect( screen.getByRole( 'heading', { name: 'Google Calendar' } ) ).toBeInTheDocument()
    expect( await screen.findByText( 'Connected as naresh@example.com' ) ).toBeInTheDocument()
  } )

  it( 'shows an error when the connection cannot be read', async () => {
    vi.mocked( getCalendar ).mockRejectedValue( new Error( 'Could not reach the server' ) )
    renderWithClient( <CalendarSettings /> )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'connects through Google', async () => {
    vi.mocked( getCalendar ).mockResolvedValue( calendarFixture( { status: 'not_connected' } ) )
    vi.mocked( startCalendarConnect ).mockResolvedValue( 'https://accounts.google.com/consent' )
    renderWithClient( <CalendarSettings /> )

    await userEvent.setup()
      .click( await screen.findByRole( 'button', { name: 'Connect Google Calendar' } ) )

    await vi.waitFor( () => expect( assign ).toHaveBeenCalledWith( 'https://accounts.google.com/consent' ) )
  } )

  it( 'asks for a calendar straight after consent, when none is chosen yet', async () => {
    vi.mocked( getCalendar ).mockResolvedValue(
      calendarFixture( { calendar: undefined, import_from: undefined, last_synced_at: undefined } ),
    )
    renderWithClient( <CalendarSettings /> )

    expect( await screen.findByRole( 'combobox', { name: 'Calendar' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Sync now' } ) ).not.toBeInTheDocument()
  } )

  it( 'opens the chooser from Change calendar, and closes it on cancel', async () => {
    renderWithClient( <CalendarSettings /> )
    const user = userEvent.setup()

    await user.click( await screen.findByRole( 'button', { name: 'Change calendar' } ) )
    expect( await screen.findByRole( 'combobox', { name: 'Calendar' } ) )
      .toHaveValue( 'naresh@example.com' )

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )
    expect( screen.queryByRole( 'combobox', { name: 'Calendar' } ) ).not.toBeInTheDocument()
  } )

  it( 'syncs now', async () => {
    vi.mocked( syncCalendar ).mockResolvedValue(
      { added: 0, updated: 0, removed: 0, drafts: 0, skipped: false },
    )
    renderWithClient( <CalendarSettings /> )

    await userEvent.setup().click( await screen.findByRole( 'button', { name: 'Sync now' } ) )

    await vi.waitFor( () => expect( syncCalendar ).toHaveBeenCalledWith() )
  } )

  it( 'shows why a sync failed', async () => {
    vi.mocked( syncCalendar ).mockRejectedValue( new Error( 'Calendar sync failed' ) )
    renderWithClient( <CalendarSettings /> )

    await userEvent.setup().click( await screen.findByRole( 'button', { name: 'Sync now' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Calendar sync failed' )
  } )

  it( 'disconnects after confirming, keeping imported time unless asked', async () => {
    vi.mocked( disconnectCalendar ).mockResolvedValue( undefined )
    renderWithClient( <CalendarSettings /> )
    const user = userEvent.setup()

    await user.click( await screen.findByRole( 'button', { name: 'Disconnect' } ) )
    await user.click( within( screen.getByRole( 'dialog' ) )
      .getByRole( 'button', { name: 'Disconnect Calendar' } ) )

    await vi.waitFor( () => expect( disconnectCalendar ).toHaveBeenCalledWith( false ) )
  } )

  it( 'shows why disconnecting failed', async () => {
    vi.mocked( disconnectCalendar ).mockRejectedValue( new Error( 'Could not reach Google' ) )
    renderWithClient( <CalendarSettings /> )
    const user = userEvent.setup()

    await user.click( await screen.findByRole( 'button', { name: 'Disconnect' } ) )
    await user.click( within( screen.getByRole( 'dialog' ) )
      .getByRole( 'button', { name: 'Disconnect Calendar' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach Google' )
  } )

  it( 'tells the user what happened after Google sends them back', async () => {
    renderWithClient(
      <CalendarSettings />,
      { route: '/settings/sources?calendar=error&reason=denied' },
    )

    expect( await screen.findByText( /Google didn't grant access/ ) ).toBeInTheDocument()
  } )
} )
