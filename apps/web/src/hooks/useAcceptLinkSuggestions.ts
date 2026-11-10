// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { AcceptLinkSuggestionsBody, LinkSuggestionsResponse } from '@atlas/shared'
// App
import { acceptLinkSuggestions } from '../api/linkSuggestions.api'
import { jobKeys, linkSuggestionKeys } from '../lib/queryKeys'

export function useAcceptLinkSuggestions(
  jobId: string,
): UseMutationResult< LinkSuggestionsResponse, Error, AcceptLinkSuggestionsBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: AcceptLinkSuggestionsBody ) => acceptLinkSuggestions( jobId, body ),
    onSuccess: ( { job, suggestions } ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      queryClient.setQueryData( linkSuggestionKeys.list( jobId ), suggestions )
    },
  } )
}
