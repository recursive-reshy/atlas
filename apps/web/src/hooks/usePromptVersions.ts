// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { PromptVersion } from '@atlas/shared'
// App
import { listVersions } from '../api/prompts.api'
import { promptKeys } from '../lib/queryKeys'

export interface PromptVersionsState {
  versions: PromptVersion[]
  isLoading: boolean
  error: string | null
}

export function usePromptVersions( profileId: string | null ): PromptVersionsState {
  const { data, error, isLoading } = useQuery( {
    queryKey: promptKeys.versions( profileId ?? '' ),
    queryFn: () => listVersions( profileId ?? '' ),
    enabled: profileId !== null,
  } )

  return {
    versions: data ?? [],
    isLoading,
    error: error === null ? null : error.message,
  }
}
