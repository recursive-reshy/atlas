// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { InboxItem } from '@atlas/shared'
// App
import { listInbox } from '../api/inbox.api'
import { inboxKeys } from './queryKeys'

export const INBOX_POLL_MS = 60_000

export interface InboxState {
  items: InboxItem[]
  isLoading: boolean
  error: string | null
}

export function useInbox(): InboxState {
  const { data, error, isPending } = useQuery( {
    queryKey: inboxKeys.all,
    queryFn: listInbox,
    refetchInterval: INBOX_POLL_MS,
    refetchOnWindowFocus: true,
  } )

  return {
    items: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
