// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetMeleteTodayResponse } from '@atlas/shared'
// App
import { getMeleteToday } from '../api/melete.api'
import { meleteKeys } from '../lib/queryKeys'

export interface MeleteTodayState {
  today: GetMeleteTodayResponse | null
  isLoading: boolean
  error: string | null
}

// `isEnabled` is false for a user without Melete, whose request would be a 404
export function useMeleteToday( isEnabled = true ): MeleteTodayState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.today,
    queryFn: getMeleteToday,
    enabled: isEnabled,
  } )

  return {
    today: data ?? null,
    isLoading: isEnabled && isPending,
    error: error === null ? null : error.message,
  }
}
