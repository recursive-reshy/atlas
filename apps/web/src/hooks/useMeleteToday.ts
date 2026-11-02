// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetMeleteTodayResponse } from '@atlas/shared'
// App
import { getMeleteToday } from '../api/melete.api'
import { meleteKeys } from './queryKeys'

export interface MeleteTodayState {
  today: GetMeleteTodayResponse | null
  isLoading: boolean
  error: string | null
}

export function useMeleteToday(): MeleteTodayState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.today,
    queryFn: getMeleteToday,
  } )

  return {
    today: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
