// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { HealthError, HealthKind } from '@atlas/shared'
// App
import { getHealthErrors } from '../api/status.api'
import { statusKeys } from './queryKeys'

export interface HealthErrorsState {
  errors: HealthError[]
  isLoading: boolean
  error: string | null
}

export function useHealthErrors(
  kind: HealthKind,
  id: string,
  enabled: boolean,
): HealthErrorsState {
  const { data, error, isFetching } = useQuery( {
    queryKey: statusKeys.errors( kind, id ),
    queryFn: () => getHealthErrors( kind, id ),
    enabled,
  } )

  return {
    errors: data ?? [],
    isLoading: isFetching,
    error: error === null ? null : error.message,
  }
}
