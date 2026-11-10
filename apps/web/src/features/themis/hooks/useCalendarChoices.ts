// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { CalendarChoice } from '@atlas/shared'
// App
import { listCalendars } from '../api/calendar.api'
import { calendarKeys } from '#src/lib/queryKeys'

export interface CalendarChoicesState {
  choices: CalendarChoice[]
  isLoading: boolean
  error: string | null
}

// Only while the chooser is open: listing calls Google
export function useCalendarChoices( isEnabled: boolean ): CalendarChoicesState {
  const { data, error, isPending } = useQuery( {
    queryKey: calendarKeys.choices,
    queryFn: listCalendars,
    enabled: isEnabled,
  } )

  return {
    choices: data ?? [],
    isLoading: isEnabled && isPending,
    error: error === null ? null : error.message,
  }
}
