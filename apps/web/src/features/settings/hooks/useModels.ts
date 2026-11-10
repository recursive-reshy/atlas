// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { ModelOption } from '@atlas/shared'
// App
import { listModels } from '../api/models.api'
import { modelKeys } from '#src/lib/queryKeys'

const ONE_HOUR_MS = 3_600_000

export interface ModelsState {
  models: ModelOption[]
  source: 'api' | 'fallback' | null
  isLoading: boolean
  error: string | null
}

export function useModels(): ModelsState {
  const { data, error, isPending } = useQuery( {
    queryKey: modelKeys.all,
    queryFn: listModels,
    staleTime: ONE_HOUR_MS,
  } )

  return {
    models: data?.models ?? [],
    source: data?.source ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
