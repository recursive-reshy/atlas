// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { LinkSuggestionsResponse, RejectLinkSuggestionsBody } from '@atlas/shared'
// App
import { rejectLinkSuggestions } from '../api/linkSuggestions.api'
import { jobKeys, linkSuggestionKeys } from './queryKeys'

export function useRejectLinkSuggestions(
  jobId: string,
): UseMutationResult< LinkSuggestionsResponse, Error, RejectLinkSuggestionsBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: RejectLinkSuggestionsBody ) => rejectLinkSuggestions( jobId, body ),
    onSuccess: ( { job, suggestions } ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      queryClient.setQueryData( linkSuggestionKeys.list( jobId ), suggestions )
    },
  } )
}
