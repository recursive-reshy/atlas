// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { PromptProfile } from '@atlas/shared'
// App
import { listProfiles } from '#src/features/settings/api/prompts.api'
import { promptKeys } from '#src/lib/queryKeys'

const MELETE_PURPOSES: ReadonlySet< PromptProfile[ 'purpose' ] > = new Set( [
  'melete_questions',
  'melete_grading',
  'melete_syllabus',
  'melete_map',
  'melete_suggest',
] )

export interface MeleteProfilesState {
  profiles: PromptProfile[]
  isLoading: boolean
  error: string | null
}

// usePromptProfiles lists summary profiles only, so every picker stays as it was; the five Melete
// prompts come from here, for the Prompts tab.
export function useMeleteProfiles(): MeleteProfilesState {
  const { data, error, isPending } = useQuery( {
    queryKey: promptKeys.melete,
    queryFn: () => listProfiles( 'all' ),
    select: ( profiles ) => profiles.filter( ( { purpose } ) => MELETE_PURPOSES.has( purpose ) ),
  } )

  return {
    profiles: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
