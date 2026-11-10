// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  ApproveCalendarDraftResponse,
  CalendarDraft,
  UpdateCalendarDraftBody,
} from '@atlas/shared'
// App
import {
  approveDraft,
  approveMatched,
  dismissDraft,
  updateDraft,
} from '../api/calendar.api'
import { calendarKeys, meleteKeys, themisKeys } from '#src/lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// Approval records time, which Themis and Melete both count, so all three refresh
const useRefreshWithTime = (): () => Promise< void > => {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries( { queryKey: calendarKeys.all } )
    await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
    await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
  }
}

export function useUpdateDraft(): Mutation<
  { id: string, body: UpdateCalendarDraftBody },
  CalendarDraft
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateCalendarDraftBody } ) => {
      return updateDraft( id, body )
    },
    onSuccess: () => queryClient.invalidateQueries( { queryKey: calendarKeys.all } ),
  } )
}

export function useApproveDraft(): Mutation< string, ApproveCalendarDraftResponse > {
  const refresh = useRefreshWithTime()

  return useMutation( {
    mutationFn: ( id: string ) => approveDraft( id ),
    onSuccess: refresh,
  } )
}

export function useApproveMatched(): Mutation< void, number > {
  const refresh = useRefreshWithTime()

  return useMutation( {
    mutationFn: () => approveMatched(),
    onSuccess: refresh,
  } )
}

// A dismissed draft leaves Themis's waiting count too
export function useDismissDraft(): Mutation< string, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( id: string ) => dismissDraft( id ),
    onSuccess: async () => {
      await queryClient.invalidateQueries( { queryKey: calendarKeys.all } )
      await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
    },
  } )
}
