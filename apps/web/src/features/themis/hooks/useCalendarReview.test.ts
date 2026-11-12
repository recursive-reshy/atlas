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
  approveDraft,
  approveMatched,
  createRule,
  deleteRule,
  dismissDraft,
  listDrafts,
  listRules,
  updateDraft,
  updateRule,
} from '../api/calendar.api'
import { calendarKeys, meleteKeys, themisKeys } from '#src/lib/queryKeys'
import { draftFixture, ruleFixture } from '../fixtures/calendarReview.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useCalendarDrafts } from './useCalendarDrafts'
import {
  useApproveDraft,
  useApproveMatched,
  useDismissDraft,
  useUpdateDraft,
} from './useCalendarDraftMutations'
import { useCalendarRules } from './useCalendarRules'
import {
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from './useCalendarRuleMutations'

vi.mock( '../api/calendar.api' )

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'useCalendarDrafts', () => {
  it( 'loads the drafts', async () => {
    vi.mocked( listDrafts ).mockResolvedValue( [ draftFixture() ] )
    const { result } = renderHookWithClient( () => useCalendarDrafts() )

    expect( result.current ).toEqual( { drafts: [], isLoading: true, error: null } )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.drafts ).toEqual( [ draftFixture() ] )
  } )

  it( 'keeps the error text', async () => {
    vi.mocked( listDrafts ).mockRejectedValue( new Error( 'Could not reach the server' ) )
    const { result } = renderHookWithClient( () => useCalendarDrafts() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )
} )

describe( 'useCalendarRules', () => {
  it( 'loads the rules', async () => {
    vi.mocked( listRules ).mockResolvedValue( [ ruleFixture() ] )
    const { result } = renderHookWithClient( () => useCalendarRules() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.rules ).toEqual( [ ruleFixture() ] )
  } )
} )

describe( 'draft mutations', () => {
  it( 'editing a draft refreshes the calendar lists', async () => {
    vi.mocked( updateDraft ).mockResolvedValue( draftFixture() )
    const { result, queryClient } = renderHookWithClient( () => useUpdateDraft() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( { id: 'd1', body: { note: 'x' } } )

    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: calendarKeys.all },
    ) )
    expect( updateDraft ).toHaveBeenCalledWith( 'd1', { note: 'x' } )
  } )

  it( 'approving one refreshes the calendar, Themis and Melete', async () => {
    vi.mocked( approveDraft ).mockResolvedValue( { time_entry_id: null, recorded_seconds: 0 } )
    const { result, queryClient } = renderHookWithClient( () => useApproveDraft() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( 'd1' )

    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: meleteKeys.all },
    ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: calendarKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  } )

  it( 'approving everything matched returns the count and refreshes the same', async () => {
    vi.mocked( approveMatched ).mockResolvedValue( 3 )
    const { result, queryClient } = renderHookWithClient( () => useApproveMatched() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate()

    await vi.waitFor( () => expect( result.current.data ).toBe( 3 ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )

  it( 'dismissing refreshes the calendar lists and Themis\'s count', async () => {
    vi.mocked( dismissDraft ).mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useDismissDraft() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( 'd1' )

    await vi.waitFor( () => expect( dismissDraft ).toHaveBeenCalledWith( 'd1' ) )
    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: themisKeys.all },
    ) )
  } )
} )

describe( 'rule mutations', () => {
  // A rule change reassigns drafts on the server, so the lists and Themis's count refresh
  const expectRefreshed = async ( invalidate: ReturnType< typeof vi.spyOn > ): Promise< void > => {
    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: calendarKeys.all },
    ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
  }

  it( 'creating a rule refreshes', async () => {
    vi.mocked( createRule ).mockResolvedValue( ruleFixture() )
    const { result, queryClient } = renderHookWithClient( () => useCreateRule() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( { phrase: 'x', goal_id: '7b000000-0000-4000-8000-000000000001' } )
    await expectRefreshed( invalidate )
  } )

  it( 'updating a rule refreshes', async () => {
    vi.mocked( updateRule ).mockResolvedValue( ruleFixture() )
    const { result, queryClient } = renderHookWithClient( () => useUpdateRule() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( { id: 'r1', body: { position: 0 } } )
    await expectRefreshed( invalidate )
  } )

  it( 'deleting a rule refreshes', async () => {
    vi.mocked( deleteRule ).mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useDeleteRule() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( 'r1' )
    await expectRefreshed( invalidate )
  } )
} )
