// Testing Library
import { screen } from '@testing-library/react'
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
import { renderWithClient } from '#src/test-support/renderWithClient'
import { startCalendarConnect } from '#src/features/themis/api/calendar.api'
import { ConnectCalendarPrompt } from './ConnectCalendarPrompt'

vi.mock( '#src/features/themis/api/calendar.api' )

const assign = vi.fn()

beforeEach( () => {
  window.localStorage.clear()
  assign.mockReset()
  vi.mocked( startCalendarConnect ).mockReset()
  vi.stubGlobal( 'location', { assign } )
} )

afterEach( () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
} )

describe( 'ConnectCalendarPrompt', () => {
  it( 'invites a user whose calendar is not connected', () => {
    renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )

    expect( screen.getByText( /Google Calendar/ ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Connect Google Calendar' } ) ).toBeEnabled()
    expect( screen.getByRole( 'button', { name: 'Dismiss' } ) ).toBeInTheDocument()
  } )

  it.each( [ 'connected', 'broken', 'not_configured' ] as const )(
    'is hidden when the status is %s',
    ( status ) => {
      renderWithClient( <ConnectCalendarPrompt status={ status } /> )

      expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
    },
  )

  it( 'goes to Google when asked to connect', async () => {
    vi.mocked( startCalendarConnect ).mockResolvedValue( 'https://accounts.google.com/consent' )
    renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )

    await userEvent.setup()
      .click( screen.getByRole( 'button', { name: 'Connect Google Calendar' } ) )

    await vi.waitFor(
      () => expect( assign ).toHaveBeenCalledWith( 'https://accounts.google.com/consent' ),
    )
  } )

  it( 'shows why connecting failed', async () => {
    vi.mocked( startCalendarConnect ).mockRejectedValue( new Error( 'Calendar isn\'t set up' ) )
    renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )

    await userEvent.setup()
      .click( screen.getByRole( 'button', { name: 'Connect Google Calendar' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Calendar isn\'t set up' )
  } )

  it( 'goes away when dismissed and stays away on the next visit', async () => {
    const { unmount } = renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Dismiss' } ) )
    expect( screen.queryByRole( 'button', { name: 'Dismiss' } ) ).not.toBeInTheDocument()
    unmount()

    renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )
    expect( screen.queryByRole( 'button', { name: 'Dismiss' } ) ).not.toBeInTheDocument()
  } )

  it( 'still shows and dismisses for the session when storage is blocked', async () => {
    vi.spyOn( Storage.prototype, 'getItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    vi.spyOn( Storage.prototype, 'setItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    renderWithClient( <ConnectCalendarPrompt status="not_connected" /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Dismiss' } ) )

    expect( screen.queryByRole( 'button', { name: 'Dismiss' } ) ).not.toBeInTheDocument()
  } )
} )
