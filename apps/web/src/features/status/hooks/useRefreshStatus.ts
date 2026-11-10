// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { GetStatusResponse } from '@atlas/shared'
// App
import { refreshStatus } from '../api/status.api'
import { statusKeys } from '#src/lib/queryKeys'

export function useRefreshStatus(): UseMutationResult< GetStatusResponse, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => refreshStatus(),
    onSuccess: ( response ) => {
      queryClient.setQueryData( statusKeys.all, response )
    },
  } )
}
