// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { CalendarRule } from '@atlas/shared'
// App
import { listRules } from '../api/calendar.api'
import { calendarKeys } from '#src/lib/queryKeys'

export interface CalendarRulesState {
  rules: CalendarRule[]
  isLoading: boolean
  error: string | null
}

export function useCalendarRules(): CalendarRulesState {
  const { data, error, isPending } = useQuery( {
    queryKey: calendarKeys.rules,
    queryFn: listRules,
  } )

  return {
    rules: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
