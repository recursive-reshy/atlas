// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { meFixture } from '#src/test-support/me.fixture'
import { meleteTodayFixture } from '#src/features/melete/fixtures/melete.fixture'
import { overviewFixture } from '../fixtures/themis.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useMe } from '#src/app/useMe'
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'
import { useThemisOverview } from './useThemisOverview'
import { useTimeTargets } from './useTimeTargets'

vi.mock( '#src/app/useMe' )
vi.mock( '#src/features/melete/hooks/useMeleteToday' )
vi.mock( './useThemisOverview' )

const signedInWith = ( modules: Parameters< typeof meFixture >[ 0 ] ): void => {
  vi.mocked( useMe ).mockReturnValue( { me: meFixture( modules ), isLoading: false, error: null } )
}

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( useMeleteToday ).mockReturnValue(
    { today: meleteTodayFixture(), isLoading: false, error: null },
  )
  vi.mocked( useThemisOverview ).mockReturnValue(
    { overview: overviewFixture(), isLoading: false, error: null },
  )
} )

describe( 'useTimeTargets', () => {
  it( 'lists the user\'s subjects and goals', () => {
    signedInWith( { modules: [ 'melete', 'themis' ] } )
    const { result } = renderHookWithClient( () => useTimeTargets() )

    expect( result.current.subjects.length ).toBeGreaterThan( 0 )
    expect( result.current.goals.map( ( { name } ) => name ) )
      .toContain( 'Move into data engineering' )
  } )

  it( 'asks only for the modules the user has', () => {
    signedInWith( { modules: [ 'transcriber' ] } )
    const { result } = renderHookWithClient( () => useTimeTargets() )

    expect( useMeleteToday ).toHaveBeenCalledWith( false )
    expect( useThemisOverview ).toHaveBeenCalledWith( 'week', false )
    expect( result.current ).toEqual( { subjects: [], goals: [] } )
  } )
} )
