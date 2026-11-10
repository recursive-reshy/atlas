// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { MeleteSyllabus } from '@atlas/shared'
// App
import { getMeleteSyllabus } from '../api/syllabus.api'
import { meleteKeys } from '../lib/queryKeys'

export interface MeleteSyllabusState {
  syllabus: MeleteSyllabus | null
  isLoading: boolean
  error: string | null
}

// Off while there is no syllabus to show: switching it on again fetches what the draft made
export function useMeleteSyllabus( subjectId: string, isEnabled = true ): MeleteSyllabusState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.syllabus( subjectId ),
    queryFn: () => getMeleteSyllabus( subjectId ),
    enabled: isEnabled,
  } )

  return {
    syllabus: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
