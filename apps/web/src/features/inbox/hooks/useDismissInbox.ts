// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { InboxItemRef } from '@atlas/shared'
// App
import { dismissInbox } from '../api/inbox.api'
import { feedKeys, gmailKeys, inboxKeys } from '#src/lib/queryKeys'

export function useDismissInbox(): UseMutationResult< void, Error, InboxItemRef[] > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( items: InboxItemRef[] ) => dismissInbox( items ),
    onSuccess: async () => {
      await Promise.all( [
        queryClient.invalidateQueries( { queryKey: inboxKeys.all } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
        queryClient.invalidateQueries( { queryKey: gmailKeys.sources } ),
      ] )
    },
  } )
}
