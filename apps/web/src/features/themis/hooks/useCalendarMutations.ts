// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  GetCalendarResponse,
  SelectCalendarBody,
  SyncCalendarResponse,
} from '@atlas/shared'
// App
import { disconnectCalendar, selectCalendar, syncCalendar } from '../api/calendar.api'
import { calendarKeys, themisKeys } from '#src/lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// Every change refreshes the connection and Themis, whose numbers and drafts follow it
const useRefreshAfter = (): () => Promise< void > => {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries( { queryKey: calendarKeys.all } )
    await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
  }
}

export function useSelectCalendar(): Mutation< SelectCalendarBody, GetCalendarResponse > {
  const refresh = useRefreshAfter()

  return useMutation( {
    mutationFn: ( body: SelectCalendarBody ) => selectCalendar( body ),
    onSuccess: refresh,
  } )
}

export function useDisconnectCalendar(): Mutation< boolean, void > {
  const refresh = useRefreshAfter()

  return useMutation( {
    mutationFn: ( removeTime: boolean ) => disconnectCalendar( removeTime ),
    onSuccess: refresh,
  } )
}

export function useSyncCalendarNow(): Mutation< void, SyncCalendarResponse > {
  const refresh = useRefreshAfter()

  return useMutation( {
    mutationFn: () => syncCalendar(),
    onSuccess: refresh,
  } )
}
