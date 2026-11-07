// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetThemisOverviewResponse, ThemisPeriod } from '@atlas/shared'
// App
import { getThemisOverview } from '../api/themis.api'
import { themisKeys } from './queryKeys'

export interface ThemisOverviewState {
  overview: GetThemisOverviewResponse | null
  isLoading: boolean
  error: string | null
}

export function useThemisOverview( period: ThemisPeriod ): ThemisOverviewState {
  const { data, error, isPending } = useQuery( {
    queryKey: themisKeys.overview( period ),
    queryFn: () => getThemisOverview( period ),
  } )

  return {
    overview: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
