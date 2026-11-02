// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { BackupResult } from '@atlas/shared'
// App
import { runBackup } from '../api/backups.api'
import { statusKeys } from './queryKeys'

export function useRunBackup(): UseMutationResult< BackupResult, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => runBackup(),
    // A failed attempt changes the backup row too.
    onSettled: () => queryClient.invalidateQueries( { queryKey: statusKeys.all } ),
  } )
}
