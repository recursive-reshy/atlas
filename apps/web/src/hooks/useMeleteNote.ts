// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { MeleteNote, MeleteQuestion } from '@atlas/shared'
// App
import { getMeleteNote } from '../api/melete.api'
import { POLL_INTERVAL_MS } from './useJob'
import { isGenerating } from './useMeleteSubject'
import { meleteKeys } from './queryKeys'

export interface MeleteNoteState {
  note: MeleteNote | null
  questions: MeleteQuestion[]
  obsidianUrl: string | null
  isLoading: boolean
  error: string | null
}

export function useMeleteNote( noteId: string ): MeleteNoteState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.note( noteId ),
    queryFn: () => getMeleteNote( noteId ),
    refetchInterval: ( query ) => {
      const note = query.state.data?.note
      return note !== undefined && isGenerating( note ) ? POLL_INTERVAL_MS : false
    },
  } )

  return {
    note: data?.note ?? null,
    questions: data?.questions ?? [],
    obsidianUrl: data?.obsidian_url ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
