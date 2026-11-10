// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job } from '@atlas/shared'
// App
import { retrySummary } from '../api/jobs.api'
import { jobKeys } from '#src/lib/queryKeys'

export function useRetrySummary( jobId: string ): UseMutationResult< Job, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => retrySummary( jobId ),
    onSuccess: async ( job ) => {
      queryClient.setQueryData( jobKeys.detail( jobId ), job )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } )
    },
  } )
}
