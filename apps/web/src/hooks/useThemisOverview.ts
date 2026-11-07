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

// `isEnabled` is false for a user without Themis, whose request would be a 404
export function useThemisOverview(
  period: ThemisPeriod,
  isEnabled = true,
): ThemisOverviewState {
  const { data, error, isPending } = useQuery( {
    queryKey: themisKeys.overview( period ),
    queryFn: () => getThemisOverview( period ),
    enabled: isEnabled,
  } )

  return {
    overview: data ?? null,
    isLoading: isEnabled && isPending,
    error: error === null ? null : error.message,
  }
}
