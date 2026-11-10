// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { answerCheckin, createArea } from '../api/themis.api'
import { CHECKIN_GOAL_ID } from '../fixtures/themis.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { themisKeys } from '#src/lib/queryKeys'
import { useAnswerCheckin, useCreateArea } from './useThemisMutations'

vi.mock( '../api/themis.api' )

beforeEach( () => {
  vi.mocked( createArea ).mockReset()
  vi.mocked( answerCheckin ).mockReset()
} )

describe( 'useCreateArea', () => {
  it( 'creates the area and refreshes the overview', async () => {
    vi.mocked( createArea ).mockResolvedValue(
      { id: '7a000000-0000-4000-8000-000000000009', name: 'Health', position: 0, created_at: 'x' },
    )
    const { result, queryClient } = renderHookWithClient( () => useCreateArea() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( { name: 'Health' } )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( createArea ).toHaveBeenCalledWith( { name: 'Health' } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )
} )

describe( 'useAnswerCheckin', () => {
  it( 'sends the answer for the goal and refreshes Themis', async () => {
    vi.mocked( answerCheckin ).mockResolvedValue(
      { id: 1, period_start: '2026-10-26', rating: 4, note: null, created_at: 'x' },
    )
    const { result, queryClient } = renderHookWithClient( () => useAnswerCheckin() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( {
      goalId: CHECKIN_GOAL_ID,
      body: { period_start: '2026-10-26', rating: 4 },
    } )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( answerCheckin ).toHaveBeenCalledWith(
      CHECKIN_GOAL_ID,
      { period_start: '2026-10-26', rating: 4 },
    )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )
} )
