// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { UsageResponse, UsageTotals, UserUsage } from '@atlas/shared'
// App
import { useAdminUsage } from '#src/hooks/useAdminUsage'
import { adminUserFixture, meFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { UsageSection } from './UsageSection'

vi.mock( '#src/hooks/useAdminUsage' )

const totals = ( overrides: Partial< UsageTotals > = {} ): UsageTotals => ( {
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: 0,
  runs: 0,
  ...overrides,
} )

const empty = () => ( {
  summary: totals(),
  linking: totals(),
  melete: totals(),
  extraction: totals(),
} )

const userUsage = ( user_id: string, overrides: Partial< UserUsage > = {} ): UserUsage => ( {
  user_id,
  month: empty(),
  all_time: empty(),
  transcription: { month_seconds: 0, all_time_seconds: 0 },
  ...overrides,
} )

const BROTHER = adminUserFixture()
const ADMIN = adminUserFixture( {
  id: meFixture().id,
  name: 'Naresh',
  email: 'naresh@example.com',
  role: 'admin',
} )
const USERS = [ ADMIN, BROTHER ]

const response = ( users: UserUsage[], month = '2026-10' ): UsageResponse => ( {
  month,
  time_zone: 'Asia/Singapore',
  users,
} )

const state = ( usage: UsageResponse | null, overrides = {} ): void => {
  vi.mocked( useAdminUsage ).mockReturnValue(
    { usage, isLoading: false, error: null, ...overrides },
  )
}

beforeEach( () => {
  vi.mocked( useAdminUsage ).mockReset()
} )

const rowFor = ( name: string ): HTMLElement => {
  return screen.getByRole( 'row', { name: new RegExp( name ) } )
}

describe( 'UsageSection', () => {
  it( 'shows each user\'s cost by category for the month, with all time beneath', () => {
    state( response( [
      userUsage( BROTHER.id, {
        month: { ...empty(), summary: totals( { cost_usd: 1.234, runs: 3 } ) },
        all_time: { ...empty(), summary: totals( { cost_usd: 10, runs: 20 } ) },
        transcription: { month_seconds: 600, all_time_seconds: 7200 },
      } ),
    ] ) )
    renderWithClient( <UsageSection users={ USERS } /> )

    const [ summary, , , , transcription ] = within( rowFor( 'Brother' ) ).getAllByRole( 'cell' )

    expect( summary ).toHaveTextContent( '$1.23' )
    expect( summary ).toHaveTextContent( 'All time $10.00' )
    expect( transcription ).toHaveTextContent( '10 min' )
    expect( transcription ).toHaveTextContent( 'All time 120 min' )
    expect( screen.getAllByRole( 'columnheader' ).map( ( cell ) => cell.textContent ) ).toEqual(
      [ 'User', 'Summaries', 'Linking', 'Melete', 'Extraction', 'Transcription', 'Total Claude' ],
    )
  } )

  it( 'totals the Claude cost and shows a dash when no run has a cost', () => {
    state( response( [
      userUsage( BROTHER.id, {
        month: {
          summary: totals( { cost_usd: 1 } ),
          linking: totals( { cost_usd: 0.5 } ),
          melete: totals( { cost_usd: null, runs: 2 } ),
          extraction: totals( { cost_usd: null } ),
        },
        all_time: {
          summary: totals( { cost_usd: null } ),
          linking: totals( { cost_usd: null } ),
          melete: totals( { cost_usd: null } ),
          extraction: totals( { cost_usd: null } ),
        },
      } ),
    ] ) )
    renderWithClient( <UsageSection users={ USERS } /> )

    const cells = within( rowFor( 'Brother' ) ).getAllByRole( 'cell' )
    const [ melete, total ] = [ cells[ 2 ], cells[ 5 ] ]

    expect( total ).toHaveTextContent( '$1.50' )
    expect( total ).toHaveTextContent( 'All time —' )
    expect( melete ).toHaveTextContent( '—' )
    expect( melete ).not.toHaveTextContent( '$' )
  } )

  it( 'lists users with no activity, and falls back to the ID for an unknown user', () => {
    state( response( [
      userUsage( BROTHER.id ),
      userUsage( '11111111-1111-4111-8111-111111111111' ),
    ] ) )
    renderWithClient( <UsageSection users={ USERS } /> )

    expect( within( rowFor( 'Brother' ) ).getAllByText( '$0.00' ).length ).toBeGreaterThan( 0 )
    expect( screen.getByRole( 'row', { name: /11111111-1111/ } ) ).toBeInTheDocument()
  } )

  it( 'offers this month and the eleven before it, and asks for the one chosen', async () => {
    state( response( [] ) )
    renderWithClient( <UsageSection users={ USERS } /> )

    await userEvent.click( screen.getByRole( 'combobox', { name: 'Month' } ) )
    const options = screen.getAllByRole( 'option' ).map( ( option ) => option.textContent )

    expect( options ).toHaveLength( 12 )
    expect( options[ 0 ] ).toBe( '2026-10' )
    expect( options[ 11 ] ).toBe( '2025-11' )

    await userEvent.click( screen.getByRole( 'option', { name: '2026-09' } ) )

    expect( useAdminUsage ).toHaveBeenLastCalledWith( '2026-09' )
  } )

  it( 'names the time zone the months are in', () => {
    state( response( [] ) )
    renderWithClient( <UsageSection users={ USERS } /> )

    expect( screen.getByText( /Asia\/Singapore/ ) ).toBeInTheDocument()
  } )

  it( 'announces loading and shows an error', () => {
    state( null, { isLoading: true } )
    const { unmount } = renderWithClient( <UsageSection users={ USERS } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading usage' )
    unmount()

    state( null, { error: 'Boom' } )
    renderWithClient( <UsageSection users={ USERS } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Boom' )
  } )
} )
