// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { SourceDocument } from '@atlas/shared'
// App
import { getSource } from '../api/jobs.api'
import { jobKeys } from '#src/lib/queryKeys'

export interface SourceState {
  source: SourceDocument | null
  error: string | null
}

export function useSource( jobId: string | null ): SourceState {
  const { data, error } = useQuery( {
    queryKey: jobKeys.source( jobId ?? '' ),
    queryFn: () => getSource( jobId ?? '' ),
    enabled: jobId !== null,
    staleTime: Infinity,
  } )

  return {
    source: data ?? null,
    error: error === null ? null : error.message,
  }
}
