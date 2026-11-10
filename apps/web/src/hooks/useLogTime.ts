// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { LogTimeBody, TimeEntry } from '@atlas/shared'
// App
import { logTime } from '../api/timeEntries.api'
import { meleteKeys, themisKeys } from '../lib/queryKeys'

// Time shows on Themis (areas, goals) and on Melete (the subject card's week figure)
export function useLogTime(): UseMutationResult< TimeEntry, Error, LogTimeBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: LogTimeBody ) => logTime( body ),
    onSuccess: async () => {
      await queryClient.invalidateQueries( { queryKey: themisKeys.all } )
      await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
    },
  } )
}
