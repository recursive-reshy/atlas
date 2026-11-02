// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job, SubmitPastedTextBody } from '@atlas/shared'
// App
import { submitPastedText } from '../api/jobs.api'
import { jobKeys } from './queryKeys'

export function useSubmitPastedText(
  jobId: string,
): UseMutationResult< Job, Error, SubmitPastedTextBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: SubmitPastedTextBody ) => submitPastedText( jobId, body ),
    onSuccess: async ( job ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } )
    },
  } )
}
