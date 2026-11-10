// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { CalendarDraft } from '@atlas/shared'
// App
import { listDrafts } from '../api/calendar.api'
import { calendarKeys } from '#src/lib/queryKeys'

export interface CalendarDraftsState {
  drafts: CalendarDraft[]
  isLoading: boolean
  error: string | null
}

export function useCalendarDrafts(): CalendarDraftsState {
  const { data, error, isPending } = useQuery( {
    queryKey: calendarKeys.drafts,
    queryFn: listDrafts,
  } )

  return {
    drafts: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
