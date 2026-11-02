// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job, RegenerateSummaryBody } from '@atlas/shared'
// App
import { regenerateSummary } from '../api/jobs.api'
import { jobKeys } from './queryKeys'

export function useRegenerateSummary(
  jobId: string,
): UseMutationResult< Job, Error, RegenerateSummaryBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: RegenerateSummaryBody ) => regenerateSummary( jobId, body ),
    onSuccess: async ( job ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } )
    },
  } )
}
