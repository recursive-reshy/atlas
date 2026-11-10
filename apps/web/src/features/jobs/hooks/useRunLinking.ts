// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job, RunLinkingBody } from '@atlas/shared'
// App
import { runLinking } from '../api/linkSuggestions.api'
import { jobKeys, linkSuggestionKeys } from '#src/lib/queryKeys'

export function useRunLinking( jobId: string ): UseMutationResult< Job, Error, RunLinkingBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: RunLinkingBody ) => runLinking( jobId, body ),
    onSuccess: async ( job ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      queryClient.removeQueries( { queryKey: linkSuggestionKeys.list( jobId ) } )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } )
    },
  } )
}
