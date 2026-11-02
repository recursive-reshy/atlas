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
// Shared
import type { StatusRow } from '@atlas/shared'
// App
import { GMAIL_CONNECT_URL } from '#src/api/gmail.api'
import { useHealthErrors } from '#src/hooks/useHealthErrors'
import { useRefreshStatus } from '#src/hooks/useRefreshStatus'
import { useStatus } from '#src/hooks/useStatus'
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { failingRowFixture, statusRowFixture } from '#src/test-support/status.fixture'
import { StatusPanel } from './StatusPanel'

vi.mock( '#src/hooks/useStatus' )
vi.mock( '#src/hooks/useRefreshStatus' )
vi.mock( '#src/hooks/useHealthErrors' )

const NOW = new Date( '2026-10-22T10:05:00.000Z' )
const refresh = vi.fn()

const show = ( rows: StatusRow[] ): void => {
  vi.mocked( useStatus ).mockReturnValue( {
    rows,
    failingCount: rows.filter( ( { state } ) => state === 'failing' ).length,
    updatedAt: NOW.getTime(),
    isLoading: false,
    error: null,
  } )
}

const feedRow = ( overrides: Partial< StatusRow > = {} ): StatusRow => statusRowFixture( {
  kind: 'feed',
  id: 'f1',
  name: 'A blog',
  ...overrides,
} )

beforeEach( () => {
  vi.useFakeTimers( { toFake: [ 'Date' ], now: NOW } )
  refresh.mockReset()
  mockMatchMedia( { isWide: true } )
  vi.mocked( useRefreshStatus ).mockReturnValue( mutationStub( { mutate: refresh } ) )
  vi.mocked( useHealthErrors ).mockReturnValue( { errors: [], isLoading: false, error: null } )
  show( [ feedRow() ] )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'StatusPanel', () => {
  it( 'has a Status heading and a table with its four columns', () => {
    renderWithClient( <StatusPanel /> )

    expect( screen.getByRole( 'heading', { name: 'Status' } ) ).toBeInTheDocument()
    expect( screen.getAllByRole( 'columnheader' ).map( ( { textContent } ) => textContent ) )
      .toEqual( [ 'Name', 'Last checked', 'Last success', 'Status' ] )
  } )

  it( 'asks the server to check once when it opens', () => {
    renderWithClient( <StatusPanel /> )

    expect( refresh ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows a row\'s name, kind, last check and last success', () => {
    show( [ feedRow( {
      last_checked_at: '2026-10-22T10:00:00.000Z',
      last_success_at: '2026-10-22T08:05:00.000Z',
    } ) ] )
    renderWithClient( <StatusPanel /> )

    const row = screen.getByRole( 'row', { name: /A blog/ } )

    expect( within( row ).getByText( 'A blog' ) ).toBeInTheDocument()
    expect( within( row ).getByText( 'Feed' ) ).toBeInTheDocument()
    expect( within( row ).getByText( '5m ago' ) ).toBeInTheDocument()
    expect( within( row ).getByText( '2h ago' ) ).toBeInTheDocument()
  } )

  it( 'says "never" for a time that does not exist', () => {
    show( [ feedRow( { last_checked_at: null, last_success_at: null } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( within( screen.getByRole( 'row', { name: /A blog/ } ) ).getAllByText( 'never' ) )
      .toHaveLength( 2 )
  } )

  it( 'shows the kind of every subject', () => {
    show( [
      feedRow(),
      statusRowFixture( { kind: 'gmail_source', id: 's1', name: 'Alerts' } ),
      statusRowFixture( { kind: 'gmail_connection', name: 'Gmail connection' } ),
      statusRowFixture( { kind: 'agent', name: 'Agent service' } ),
      statusRowFixture( { kind: 'transcription', name: 'Transcription (OpenAI)' } ),
    ] )
    renderWithClient( <StatusPanel /> )

    const kinds = [ 'Feed', 'Gmail source', 'Gmail', 'Service', 'Service' ]

    expect( screen.getAllByRole( 'row' ).slice( 1 ).map( ( row, index ) => {
      return within( row ).queryByText( kinds[ index ] ?? '' ) !== null
    } ) ).toEqual( kinds.map( () => true ) )
  } )

  it( 'shows a user\'s vault sync by the name the server gives it', () => {
    show( [
      statusRowFixture( { kind: 'vault_sync', id: 'alex', name: 'Vault sync: Alex' } ),
      failingRowFixture( { kind: 'vault_sync', id: 'sam', name: 'Vault sync: Sam' } ),
    ] )
    renderWithClient( <StatusPanel /> )

    const alex = screen.getByRole( 'row', { name: /Vault sync: Alex/ } )

    expect( within( alex ).getByText( 'Vault sync' ) ).toBeInTheDocument()
    const sam = screen.getByRole( 'row', { name: /Vault sync: Sam/ } )

    expect( within( sam ).getByText( 'Failing' ) ).toBeInTheDocument()
  } )

  it( 'shows a row\'s detail', () => {
    show( [ statusRowFixture( {
      kind: 'replication',
      name: 'Replication',
      detail: 'Last synced 10:00',
    } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.getByText( 'Last synced 10:00' ) ).toBeInTheDocument()
  } )

  it.each( [
    [ 'ok', 'OK' ],
    [ 'failing', 'Failing' ],
    [ 'off', 'Off' ],
  ] as const )( 'shows %s as text with an icon', ( state, label ) => {
    show( [ feedRow( { state } ) ] )
    renderWithClient( <StatusPanel /> )

    const cell = screen.getByRole( 'cell', { name: new RegExp( label ) } )

    expect( within( cell ).getByText( label ) ).toBeInTheDocument()
    expect( cell.querySelector( 'svg' ) ).not.toBeNull()
  } )

  it( 'shows the latest error on a failing row only', () => {
    show( [
      failingRowFixture( {
        kind: 'feed',
        id: 'f1',
        name: 'Bad',
        last_error: 'The site answered 500',
      } ),
      feedRow( { id: 'f2', name: 'Good' } ),
    ] )
    renderWithClient( <StatusPanel /> )

    const bad = screen.getByRole( 'row', { name: /Bad/ } )
    const good = screen.getByRole( 'row', { name: /Good/ } )

    expect( within( bad ).getByText( 'The site answered 500' ) ).toBeInTheDocument()
    expect( within( good ).queryByText( /answered/ ) ).not.toBeInTheDocument()
  } )
} )

describe( 'StatusPanel loading and errors', () => {
  it( 'says it is loading', () => {
    vi.mocked( useStatus ).mockReturnValue( {
      rows: [],
      failingCount: 0,
      updatedAt: 0,
      isLoading: true,
      error: null,
    } )
    renderWithClient( <StatusPanel /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading status…' )
    expect( screen.queryByRole( 'table' ) ).not.toBeInTheDocument()
  } )

  it( 'shows why it could not load', () => {
    vi.mocked( useStatus ).mockReturnValue( {
      rows: [],
      failingCount: 0,
      updatedAt: 0,
      isLoading: false,
      error: 'Could not reach the server',
    } )
    renderWithClient( <StatusPanel /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )

describe( 'StatusPanel error history', () => {
  const showButton = (): HTMLElement => {
    return screen.getByRole( 'button', { name: 'Show recent errors for Bad feed' } )
  }

  const failing = (): StatusRow => failingRowFixture( {
    kind: 'feed',
    id: 'f1',
    name: 'Bad feed',
    last_error: 'The site answered 500',
  } )

  it( 'has an expand button on a failing row only, closed and idle at first', () => {
    show( [
      failing(),
      feedRow( { id: 'f2', name: 'Good' } ),
      feedRow( { id: 'f3', state: 'off' } ),
    ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.getAllByRole( 'button', { name: /recent errors/ } ) ).toHaveLength( 1 )
    expect( screen.getByRole( 'button', { name: 'Show recent errors for Bad feed' } ) )
      .toHaveAttribute( 'aria-expanded', 'false' )
    expect( vi.mocked( useHealthErrors ) ).not.toHaveBeenCalledWith( 'feed', 'f1', true )
  } )

  it( 'opens the recent errors with their times and loads them for that subject', async () => {
    vi.useRealTimers()
    show( [ failing() ] )
    vi.mocked( useHealthErrors ).mockReturnValue( {
      errors: [
        { at: '2026-10-22T10:00:00.000Z', message: 'The site answered 500' },
        { at: '2026-10-22T09:00:00.000Z', message: 'Timed out' },
      ],
      isLoading: false,
      error: null,
    } )
    renderWithClient( <StatusPanel /> )

    await userEvent.click( showButton() )

    const button = screen.getByRole( 'button', { name: 'Hide recent errors for Bad feed' } )
    const list = screen.getByRole( 'list', { name: 'Recent errors for Bad feed' } )
    const items = within( list ).getAllByRole( 'listitem' )

    expect( button ).toHaveAttribute( 'aria-expanded', 'true' )
    expect( vi.mocked( useHealthErrors ) ).toHaveBeenCalledWith( 'feed', 'f1', true )
    expect( items ).toHaveLength( 2 )
    expect( items[ 1 ] ).toHaveTextContent( 'Timed out' )
    expect( items[ 1 ]?.querySelector( 'time' ) )
      .toHaveAttribute( 'datetime', '2026-10-22T09:00:00.000Z' )
  } )

  it( 'says when the history could not be loaded', async () => {
    vi.useRealTimers()
    show( [ failing() ] )
    vi.mocked( useHealthErrors ).mockReturnValue( { errors: [], isLoading: false, error: 'Nope' } )
    renderWithClient( <StatusPanel /> )

    await userEvent.click( showButton() )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Nope' )
  } )
} )

describe( 'StatusPanel Gmail connection', () => {
  const connection = ( overrides: Partial< StatusRow > ): StatusRow => statusRowFixture( {
    kind: 'gmail_connection',
    name: 'Gmail connection',
    ...overrides,
  } )

  it( 'offers Reconnect when Google no longer accepts the access', () => {
    show( [ failingRowFixture( {
      kind: 'gmail_connection',
      name: 'Gmail connection',
      last_error: 'Google no longer accepts Atlas\'s access (revoked, expired)',
    } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.getByText( /Google no longer accepts/ ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Reconnect' } ) )
      .toHaveAttribute( 'href', GMAIL_CONNECT_URL )
  } )

  it.each( [ 'ok', 'off' ] as const )( 'does not offer Reconnect when it is %s', ( state ) => {
    show( [ connection( { state } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.queryByRole( 'link', { name: 'Reconnect' } ) ).not.toBeInTheDocument()
  } )

  it( 'does not offer Reconnect on another failing row', () => {
    show( [ failingRowFixture( { kind: 'agent', name: 'Agent service' } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.queryByRole( 'link', { name: 'Reconnect' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'StatusPanel on a narrow window', () => {
  it( 'stacks each row in a list instead of a table, with the same content', () => {
    mockMatchMedia( { isWide: false } )
    show( [ failingRowFixture( { kind: 'feed', id: 'f1', name: 'Bad feed' } ) ] )
    renderWithClient( <StatusPanel /> )

    expect( screen.queryByRole( 'table' ) ).not.toBeInTheDocument()

    const item = within( screen.getByRole( 'list', { name: 'Status' } ) ).getByRole( 'listitem' )

    expect( within( item ).getByText( 'Bad feed' ) ).toBeInTheDocument()
    expect( within( item ).getByText( 'Failing' ) ).toBeInTheDocument()
    expect( within( item ).getByText( /Last success/ ) ).toBeInTheDocument()
    expect( within( item ).getByRole( 'button', { name: 'Show recent errors for Bad feed' } ) )
      .toBeInTheDocument()
  } )
} )
