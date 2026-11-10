// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  CalendarRule,
  CreateCalendarRuleBody,
  UpdateCalendarRuleBody,
} from '@atlas/shared'
// App
import { createRule, deleteRule, updateRule } from '../api/calendar.api'
import { calendarKeys, themisKeys } from '#src/lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// A rule change reassigns drafts on the server, so the drafts and the waiting count refresh
const useRefreshAfterRule = (): () => Promise< void > => {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries( { queryKey: calendarKeys.all } )
    await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
  }
}

export function useCreateRule(): Mutation< CreateCalendarRuleBody, CalendarRule > {
  const refresh = useRefreshAfterRule()

  return useMutation( {
    mutationFn: ( body: CreateCalendarRuleBody ) => createRule( body ),
    onSuccess: refresh,
  } )
}

export function useUpdateRule(): Mutation<
  { id: string, body: UpdateCalendarRuleBody },
  CalendarRule
> {
  const refresh = useRefreshAfterRule()

  return useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateCalendarRuleBody } ) => {
      return updateRule( id, body )
    },
    onSuccess: refresh,
  } )
}

export function useDeleteRule(): Mutation< string, void > {
  const refresh = useRefreshAfterRule()

  return useMutation( {
    mutationFn: ( id: string ) => deleteRule( id ),
    onSuccess: refresh,
  } )
}
