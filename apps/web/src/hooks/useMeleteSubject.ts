// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { MeleteNote, MeleteSubject } from '@atlas/shared'
// App
import { getMeleteSubject } from '../api/melete.api'
import { POLL_INTERVAL_MS } from './useJob'
import { meleteKeys } from '../lib/queryKeys'

export interface MeleteSubjectState {
  subject: MeleteSubject | null
  notes: MeleteNote[]
  isLoading: boolean
  error: string | null
}

export const isGenerating = ( note: MeleteNote ): boolean => {
  return note.generation === 'queued' || note.generation === 'generating'
}

export function useMeleteSubject( subjectId: string ): MeleteSubjectState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.subject( subjectId ),
    queryFn: () => getMeleteSubject( subjectId ),
    refetchInterval: ( query ) => {
      const current = query.state.data
      const isBusy = current?.notes.some( isGenerating ) === true
        || current?.subject.syllabus_status === 'drafting'

      return isBusy ? POLL_INTERVAL_MS : false
    },
  } )

  return {
    subject: data?.subject ?? null,
    notes: data?.notes ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
