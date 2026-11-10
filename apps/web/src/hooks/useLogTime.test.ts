// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { logTime } from '../api/timeEntries.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { SUBJECT_ID } from '../test-support/themis.fixture'
import { meleteKeys, themisKeys } from '../lib/queryKeys'
import { useLogTime } from './useLogTime'

vi.mock( '../api/timeEntries.api' )

beforeEach( () => {
  vi.mocked( logTime ).mockReset()
} )

describe( 'useLogTime', () => {
  it( 'logs the time, then refreshes everything that shows time', async () => {
    vi.mocked( logTime ).mockResolvedValue( {
      id: '7d000000-0000-4000-8000-000000000001',
      source: 'logged',
      subject_id: SUBJECT_ID,
      goal_id: null,
      day: '2026-11-08',
      seconds: 1800,
      note: null,
      created_at: 'x',
      updated_at: 'x',
    } )
    const { result, queryClient } = renderHookWithClient( () => useLogTime() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )
    const body = { subject_id: SUBJECT_ID, day: '2026-11-08', minutes: 30 }

    result.current.mutate( body )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( logTime ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )
} )
