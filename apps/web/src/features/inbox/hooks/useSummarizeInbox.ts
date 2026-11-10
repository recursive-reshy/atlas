// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { InboxItem, Job, SummarizeInboxBody } from '@atlas/shared'
// App
import { listInbox, summarizeInbox } from '../api/inbox.api'
import {
  feedKeys,
  gmailKeys,
  inboxKeys,
  jobKeys,
} from '#src/lib/queryKeys'

export interface SummarizeOutcome {
  jobs: Job[]
  // Items that were asked for and are still in the inbox: the server queued the others.
  failedTitles: string[]
}

const stillWaiting = ( body: SummarizeInboxBody, inbox: InboxItem[] ): string[] => {
  return inbox
    .filter( ( { kind, id } ) => body.items.some( ( ref ) => ref.kind === kind && ref.id === id ) )
    .map( ( { title } ) => title )
}

export function useSummarizeInbox(): UseMutationResult<
  SummarizeOutcome,
  Error,
  SummarizeInboxBody
> {
  const queryClient = useQueryClient()

  return useMutation( {
    // The response only carries the jobs that were made. Reading the inbox again tells which
    // of the items did not become one, and puts the fresh inbox on screen.
    mutationFn: async ( body: SummarizeInboxBody ) => {
      const jobs = await summarizeInbox( body )
      const inbox = await queryClient.fetchQuery( {
        queryKey: inboxKeys.all,
        queryFn: listInbox,
        staleTime: 0,
      } )

      return { jobs, failedTitles: stillWaiting( body, inbox ) }
    },
    onSuccess: async () => {
      await Promise.all( [
        queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } ),
        queryClient.invalidateQueries( { queryKey: inboxKeys.all } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
        queryClient.invalidateQueries( { queryKey: gmailKeys.sources } ),
      ] )
    },
  } )
}
