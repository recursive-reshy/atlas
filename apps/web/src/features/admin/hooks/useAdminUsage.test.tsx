// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { getUsage } from '../api/admin.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useAdminUsage } from './useAdminUsage'

vi.mock( '../api/admin.api' )

const usage = { month: '2026-10', time_zone: 'Asia/Singapore', users: [] }

beforeEach( () => {
  vi.mocked( getUsage ).mockReset()
  vi.mocked( getUsage ).mockResolvedValue( usage )
} )

describe( 'useAdminUsage', () => {
  it( 'asks for the current month when none is chosen', async () => {
    const { result } = renderHookWithClient( () => useAdminUsage( null ) )

    expect( result.current.isLoading ).toBe( true )
    await vi.waitFor( () => expect( result.current.usage ).toEqual( usage ) )
    expect( getUsage ).toHaveBeenCalledWith( undefined )
  } )

  it( 'asks for the chosen month', async () => {
    renderHookWithClient( () => useAdminUsage( '2026-09' ) )

    await vi.waitFor( () => expect( getUsage ).toHaveBeenCalledWith( '2026-09' ) )
  } )

  it( 'keeps the last month on screen while the next one loads', async () => {
    const { result, rerender } = renderHookWithClient(
      ( { month }: { month: string | null } ) => useAdminUsage( month ),
      { initialProps: { month: null as string | null } },
    )
    await vi.waitFor( () => expect( result.current.usage ).toEqual( usage ) )
    vi.mocked( getUsage ).mockReturnValue( new Promise( () => undefined ) )

    rerender( { month: '2026-09' } )

    expect( result.current.usage ).toEqual( usage )
  } )

  it( 'reports an error', async () => {
    vi.mocked( getUsage ).mockRejectedValue( new Error( 'Boom' ) )
    const { result } = renderHookWithClient( () => useAdminUsage( null ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Boom' ) )
  } )
} )
