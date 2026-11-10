// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../lib/apiError'
import { getThemisGoal, getThemisGoals } from '../api/themis.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { METRIC_GOAL_ID } from '../test-support/themis.fixture'
import { goalDetailFixture, goalsListFixture } from '../test-support/themisGoal.fixture'
import { useThemisGoal, useThemisGoals } from './useThemisGoals'

vi.mock( '../api/themis.api' )

beforeEach( () => {
  vi.mocked( getThemisGoal ).mockReset()
  vi.mocked( getThemisGoals ).mockReset()
} )

describe( 'useThemisGoal', () => {
  it( 'starts loading, then returns the goal with its history', async () => {
    vi.mocked( getThemisGoal ).mockResolvedValue( goalDetailFixture() )
    const { result } = renderHookWithClient( () => useThemisGoal( METRIC_GOAL_ID ) )

    expect( result.current ).toEqual( { detail: null, isLoading: true, error: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.detail ).toEqual( goalDetailFixture() )
    expect( getThemisGoal ).toHaveBeenCalledWith( METRIC_GOAL_ID )
  } )

  it( 'reports a load error', async () => {
    vi.mocked( getThemisGoal ).mockRejectedValue( new ApiError( 'Goal not found', 404 ) )
    const { result } = renderHookWithClient( () => useThemisGoal( METRIC_GOAL_ID ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Goal not found' ) )
    expect( result.current.detail ).toBeNull()
  } )
} )

describe( 'useThemisGoals', () => {
  it( 'returns every goal', async () => {
    vi.mocked( getThemisGoals ).mockResolvedValue( goalsListFixture() )
    const { result } = renderHookWithClient( () => useThemisGoals() )

    expect( result.current ).toEqual( { goals: null, isLoading: true, error: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.goals ).toEqual( goalsListFixture().goals )
  } )

  it( 'reports a load error', async () => {
    vi.mocked( getThemisGoals )
      .mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useThemisGoals() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )
} )
