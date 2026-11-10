// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GetMeleteGapsResponse } from '@atlas/shared'
// App
import { getMeleteGaps } from '../api/gaps.api'
import { meleteKeys } from '#src/lib/queryKeys'

export interface MeleteGapsState {
  gaps: GetMeleteGapsResponse | null
  isLoading: boolean
  error: string | null
}

// Under the subject key, so a recorded review or a change to the notes refreshes it
export function useMeleteGaps( subjectId: string ): MeleteGapsState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.gaps( subjectId ),
    queryFn: () => getMeleteGaps( subjectId ),
  } )

  return {
    gaps: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
