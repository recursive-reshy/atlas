// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { calendarFixture } from '#src/features/themis/fixtures/calendar.fixture'
import { CalendarAccountCard } from './CalendarAccountCard'

const handlers = () => ( {
  isBusy: false,
  onConnect: vi.fn(),
  onSync: vi.fn(),
  onChange: vi.fn(),
  onDisconnect: vi.fn(),
} )

describe( 'CalendarAccountCard', () => {
  it( 'explains the setup when Calendar is not configured, with no way to connect', () => {
    render( <CalendarAccountCard
      calendar={ calendarFixture( { status: 'not_configured' } ) }
      { ...handlers() }
    /> )

    expect( screen.getByText( /CALENDAR_REDIRECT_URI/ ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
  } )

  it( 'offers Connect Google Calendar when not connected', async () => {
    const actions = handlers()

    render( <CalendarAccountCard
      calendar={ calendarFixture( { status: 'not_connected' } ) }
      { ...actions }
    /> )
    await userEvent.setup()
      .click( screen.getByRole( 'button', { name: 'Connect Google Calendar' } ) )

    expect( actions.onConnect ).toHaveBeenCalled()
  } )

  it( 'shows the account, the calendar and the last sync when connected', () => {
    render( <CalendarAccountCard
      calendar={ calendarFixture() }
      now={ Date.parse( '2026-11-10T08:05:00.000Z' ) }
      { ...handlers() }
    /> )

    expect( screen.getByText( 'Connected as naresh@example.com' ) ).toBeInTheDocument()
    expect( screen.getByText( /Calendar: Naresh/ ) ).toBeInTheDocument()
    expect( screen.getByText( /Importing from 2026-11-01/ ) ).toBeInTheDocument()
    expect( screen.getByText( /Last synced 5m ago/ ) ).toBeInTheDocument()
  } )

  it( 'says so when it has never synced', () => {
    render( <CalendarAccountCard
      calendar={ calendarFixture( { last_synced_at: undefined } ) }
      { ...handlers() }
    /> )

    expect( screen.getByText( /Not synced yet/ ) ).toBeInTheDocument()
  } )

  it( 'has Sync now, Change calendar and Disconnect when connected', async () => {
    const actions = handlers()
    const user = userEvent.setup()

    render( <CalendarAccountCard calendar={ calendarFixture() } { ...actions } /> )
    await user.click( screen.getByRole( 'button', { name: 'Sync now' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Change calendar' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Disconnect' } ) )

    expect( actions.onSync ).toHaveBeenCalled()
    expect( actions.onChange ).toHaveBeenCalled()
    expect( actions.onDisconnect ).toHaveBeenCalled()
  } )

  it( 'disables Sync now while busy', () => {
    render( <CalendarAccountCard calendar={ calendarFixture() } { ...handlers() } isBusy /> )

    expect( screen.getByRole( 'button', { name: 'Syncing…' } ) ).toBeDisabled()
  } )

  it( 'asks to reconnect when broken, and says imported time is kept', async () => {
    const actions = handlers()

    render( <CalendarAccountCard
      calendar={ calendarFixture( { status: 'broken', error: 'Google no longer accepts it' } ) }
      { ...actions }
    /> )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'Google no longer accepts it' )
    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'imported time is kept' )
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Reconnect' } ) )
    expect( actions.onConnect ).toHaveBeenCalled()
    expect( screen.getByRole( 'button', { name: 'Disconnect' } ) ).toBeInTheDocument()
  } )
} )
