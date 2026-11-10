// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { StoredLinkSuggestion } from '@atlas/shared'
// App
import { listLinkSuggestions } from '../api/linkSuggestions.api'
import { linkSuggestionKeys } from '../lib/queryKeys'

export interface LinkSuggestionsState {
  suggestions: StoredLinkSuggestion[]
  isLoading: boolean
  error: string | null
}

export function useLinkSuggestions(
  jobId: string,
  { enabled }: { enabled: boolean },
): LinkSuggestionsState {
  const { data, error, isLoading } = useQuery( {
    queryKey: linkSuggestionKeys.list( jobId ),
    queryFn: () => listLinkSuggestions( jobId ),
    enabled,
  } )

  return {
    suggestions: data ?? [],
    isLoading,
    error: error === null ? null : error.message,
  }
}
