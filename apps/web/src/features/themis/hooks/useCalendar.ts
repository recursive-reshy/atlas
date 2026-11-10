// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetCalendarResponse } from '@atlas/shared'
// App
import { getCalendar } from '../api/calendar.api'
import { calendarKeys } from '#src/lib/queryKeys'

export interface CalendarState {
  calendar: GetCalendarResponse | null
  isLoading: boolean
  error: string | null
}

export function useCalendar(): CalendarState {
  const { data, error, isPending } = useQuery( {
    queryKey: calendarKeys.status,
    queryFn: getCalendar,
  } )

  return {
    calendar: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
