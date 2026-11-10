// Testing Library
import { screen, waitFor } from '@testing-library/react'
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
import { useGmailAccount } from '#src/features/gmail/hooks/useGmailAccount'
import { gmailAccountFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GmailSettings } from './GmailSettings'

vi.mock( '#src/features/gmail/hooks/useGmailAccount' )
vi.mock( '../GmailSources', () => ( {
  GmailSources: ( { connected }: { connected: boolean } ) => (
    <p>{ `Sources, connected: ${ String( connected ) }` }</p>
  ),
} ) )

const mockedAccount = vi.mocked( useGmailAccount )

type State = ReturnType< typeof useGmailAccount >

const state = ( overrides: Partial< State > = {} ): State => ( {
  account: gmailAccountFixture(),
  isLoading: false,
  error: null,
  disconnect: mutationStub(),
  ...overrides,
} )

beforeEach( () => {
  mockedAccount.mockReturnValue( state() )
} )

describe( 'GmailSettings', () => {
  it( 'has a Gmail heading', () => {
    renderWithClient( <GmailSettings /> )

    expect( screen.getByRole( 'heading', { level: 3, name: 'Gmail' } ) ).toBeInTheDocument()
  } )

  it( 'announces loading', () => {
    mockedAccount.mockReturnValue( state( { account: null, isLoading: true } ) )
    renderWithClient( <GmailSettings /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading Gmail…' )
  } )

  it( 'shows an error when the account cannot be loaded', () => {
    mockedAccount.mockReturnValue(
      state( { account: null, error: 'Could not reach the server' } ),
    )
    renderWithClient( <GmailSettings /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  describe( 'not configured', () => {
    beforeEach( () => {
      mockedAccount.mockReturnValue( state( {
        account: gmailAccountFixture(
          { status: 'not_configured', email: null, connected_at: null },
        ),
      } ) )
    } )

    it( 'explains the setup and links to the README section', () => {
      renderWithClient( <GmailSettings /> )

      expect( screen.getByText( /GOOGLE_CLIENT_ID/ ) ).toBeInTheDocument()
      expect( screen.getByRole( 'link', { name: /setup steps/i } ) )
        .toHaveAttribute( 'href', expect.stringContaining( '#google-cloud-setup' ) as string )
    } )

    it( 'offers no way to connect', () => {
      renderWithClient( <GmailSettings /> )

      expect( screen.queryByRole( 'link', { name: 'Connect Gmail' } ) ).not.toBeInTheDocument()
    } )
  } )

  describe( 'not connected', () => {
    it( 'offers Connect Gmail as a plain link to the server', () => {
      mockedAccount.mockReturnValue( state( {
        account: gmailAccountFixture(
          { status: 'not_connected', email: null, connected_at: null },
        ),
      } ) )
      renderWithClient( <GmailSettings /> )

      expect( screen.getByRole( 'link', { name: 'Connect Gmail' } ) )
        .toHaveAttribute( 'href', '/api/gmail/connect' )
    } )
  } )

  describe( 'connected', () => {
    it( 'shows the address and a Disconnect button', () => {
      renderWithClient( <GmailSettings /> )

      expect( screen.getByText( 'Connected as naresh@example.com' ) ).toBeInTheDocument()
      expect( screen.getByRole( 'button', { name: 'Disconnect' } ) ).toBeInTheDocument()
    } )

    it( 'asks before disconnecting, then disconnects', async () => {
      const mutate = vi.fn()
      const user = userEvent.setup()

      mockedAccount.mockReturnValue( state( { disconnect: mutationStub( { mutate } ) } ) )
      renderWithClient( <GmailSettings /> )

      await user.click( screen.getByRole( 'button', { name: 'Disconnect' } ) )

      const dialog = screen.getByRole( 'dialog', { name: /disconnect gmail/i } )

      expect( dialog ).toHaveTextContent( /sources.*kept/i )
      expect( mutate ).not.toHaveBeenCalled()

      await user.click( screen.getByRole( 'button', { name: 'Disconnect Gmail' } ) )

      expect( mutate ).toHaveBeenCalledOnce()
      await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    } )

    it( 'does not disconnect when cancelled', async () => {
      const mutate = vi.fn()
      const user = userEvent.setup()

      mockedAccount.mockReturnValue( state( { disconnect: mutationStub( { mutate } ) } ) )
      renderWithClient( <GmailSettings /> )

      await user.click( screen.getByRole( 'button', { name: 'Disconnect' } ) )
      await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

      expect( mutate ).not.toHaveBeenCalled()
      await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    } )

    it( 'shows a failed disconnect', () => {
      mockedAccount.mockReturnValue( state( {
        disconnect: mutationStub( { isError: true, error: new Error( 'Boom' ) } ),
      } ) )
      renderWithClient( <GmailSettings /> )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Boom' )
    } )
  } )

  describe( 'reconnect needed', () => {
    it( 'shows the reason and a Reconnect link', () => {
      mockedAccount.mockReturnValue( state( {
        account: gmailAccountFixture( {
          status: 'reconnect_needed',
          error: 'Google no longer accepts access',
        } ),
      } ) )
      renderWithClient( <GmailSettings /> )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Reconnect needed' )
      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Google no longer accepts access' )
      expect( screen.getByRole( 'link', { name: 'Reconnect' } ) )
        .toHaveAttribute( 'href', '/api/gmail/connect' )
    } )
  } )

  describe( 'after Google sends the browser back', () => {
    it( 'confirms a connection and removes the query', async () => {
      const { location } = renderWithClient(
        <GmailSettings />,
        { route: '/settings?gmail=connected' },
      )

      expect( await screen.findByText( 'Gmail connected' ) ).toBeInTheDocument()
      expect( location().search ).toBe( '' )
    } )

    it( 'explains a refused consent', async () => {
      renderWithClient(
        <GmailSettings />,
        { route: '/settings?gmail=error&reason=denied' },
      )

      expect( await screen.findByText( /Google didn't grant access/ ) ).toBeInTheDocument()
    } )
  } )
} )

describe( 'GmailSettings: sources', () => {
  type Status = 'not_configured' | 'not_connected' | 'connected' | 'reconnect_needed'

  const withStatus = ( status: Status ): void => {
    mockedAccount.mockReturnValue( state( { account: gmailAccountFixture( { status } ) } ) )
  }

  it( 'shows the sources of a connected account', () => {
    withStatus( 'connected' )
    renderWithClient( <GmailSettings /> )

    expect( screen.getByText( 'Sources, connected: true' ) ).toBeInTheDocument()
  } )

  it.each( [ 'not_connected', 'reconnect_needed' ] as const )(
    'keeps showing the sources when the status is %s, as not connected',
    ( status ) => {
      withStatus( status )
      renderWithClient( <GmailSettings /> )

      expect( screen.getByText( 'Sources, connected: false' ) ).toBeInTheDocument()
    },
  )

  it( 'shows no sources when Gmail is not configured', () => {
    withStatus( 'not_configured' )
    renderWithClient( <GmailSettings /> )

    expect( screen.queryByText( /^Sources, connected/ ) ).not.toBeInTheDocument()
  } )

  it( 'shows no sources until the account is known', () => {
    mockedAccount.mockReturnValue( state( { account: null, isLoading: true } ) )
    renderWithClient( <GmailSettings /> )

    expect( screen.queryByText( /^Sources, connected/ ) ).not.toBeInTheDocument()
  } )
} )
