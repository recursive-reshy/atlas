// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  createGoal,
  deleteArea,
  deleteGoal,
  logMetric,
  setGoalSubjects,
  updateArea,
  updateGoal,
} from '../api/themis.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import {
  CAREER_ID,
  METRIC_GOAL_ID,
  SUBJECT_ID,
  metricCardFixture,
} from '../test-support/themis.fixture'
import { meleteKeys, themisKeys } from './queryKeys'
import {
  useCreateGoal,
  useDeleteArea,
  useDeleteGoal,
  useLogMetric,
  useSetGoalSubjects,
  useUpdateArea,
  useUpdateGoal,
} from './useGoalMutations'

vi.mock( '../api/themis.api' )

beforeEach( () => {
  vi.resetAllMocks()
} )

const ran = async < Vars >(
  hook: () => { mutate: ( vars: Vars ) => void, isSuccess: boolean },
  vars: Vars,
) => {
  const { result, queryClient } = renderHookWithClient( hook )
  const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

  result.current.mutate( vars )
  await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )

  return invalidate
}

describe( 'goal and area mutations', () => {
  it( 'renames an area and refreshes Themis', async () => {
    vi.mocked( updateArea ).mockResolvedValue(
      { id: CAREER_ID, name: 'Work', position: 0, created_at: 'x' },
    )
    const invalidate = await ran( () => useUpdateArea(), { id: CAREER_ID, body: { name: 'Work' } } )

    expect( updateArea ).toHaveBeenCalledWith( CAREER_ID, { name: 'Work' } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )

  it( 'deletes an area and refreshes Themis', async () => {
    vi.mocked( deleteArea ).mockResolvedValue()
    const invalidate = await ran( () => useDeleteArea(), CAREER_ID )

    expect( deleteArea ).toHaveBeenCalledWith( CAREER_ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )

  it( 'creates a goal and refreshes Themis', async () => {
    vi.mocked( createGoal ).mockResolvedValue( metricCardFixture().goal )
    const body = { area_id: CAREER_ID, name: 'X', outcome: 'learning' } as const
    const invalidate = await ran( () => useCreateGoal(), body )

    expect( createGoal ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )

  it( 'changes a goal and refreshes Themis and the subjects that show its link', async () => {
    vi.mocked( updateGoal ).mockResolvedValue( metricCardFixture().goal )
    const invalidate = await ran(
      () => useUpdateGoal(),
      { id: METRIC_GOAL_ID, body: { status: 'dropped' as const } },
    )

    expect( updateGoal ).toHaveBeenCalledWith( METRIC_GOAL_ID, { status: 'dropped' } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )

  it( 'deletes a goal and refreshes Themis and Melete (its subjects are unlinked)', async () => {
    vi.mocked( deleteGoal ).mockResolvedValue()
    const invalidate = await ran( () => useDeleteGoal(), METRIC_GOAL_ID )

    expect( deleteGoal ).toHaveBeenCalledWith( METRIC_GOAL_ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )

  it( 'records a metric value and refreshes Themis', async () => {
    vi.mocked( logMetric ).mockResolvedValue( { id: 1, value: 3, note: null, at: 'x' } )
    const invalidate = await ran(
      () => useLogMetric(),
      { goalId: METRIC_GOAL_ID, body: { value: 3 } },
    )

    expect( logMetric ).toHaveBeenCalledWith( METRIC_GOAL_ID, { value: 3 } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )

  it( 'links subjects and refreshes Themis and Melete', async () => {
    vi.mocked( setGoalSubjects ).mockResolvedValue( [] )
    const invalidate = await ran(
      () => useSetGoalSubjects(),
      { goalId: METRIC_GOAL_ID, subjectIds: [ SUBJECT_ID ] },
    )

    expect( setGoalSubjects ).toHaveBeenCalledWith( METRIC_GOAL_ID, [ SUBJECT_ID ] )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )
} )
