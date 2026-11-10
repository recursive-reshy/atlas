// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// App
import { saveJob } from '../api/jobs.api'
import { jobKeys } from '#src/lib/queryKeys'

export function useSaveJob(
  jobId: string,
  flush: () => Promise< boolean >,
): UseMutationResult< string, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: async () => {
      if( !await flush() ) {
        throw new Error(
          'Your latest edits could not be saved, so the note was not written to the vault.',
        )
      }

      return saveJob( jobId )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries( { queryKey: jobKeys.all } )
    },
  } )
}
