// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { PromptProfile } from '@atlas/shared'
// App
import { listProfiles } from '../api/prompts.api'
import { promptKeys } from './queryKeys'

export interface MeleteProfilesState {
  profiles: PromptProfile[]
  isLoading: boolean
  error: string | null
}

// usePromptProfiles lists summary profiles only, so every picker stays as it was; the two Melete
// prompts come from here, for the Prompts tab.
export function useMeleteProfiles(): MeleteProfilesState {
  const { data, error, isPending } = useQuery( {
    queryKey: promptKeys.melete,
    queryFn: () => listProfiles( 'all' ),
    select: ( profiles ) => profiles.filter(
      ( { purpose } ) => purpose === 'melete_questions' || purpose === 'melete_grading',
    ),
  } )

  return {
    profiles: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
