// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { GmailLabel } from '@atlas/shared'
// App
import { listGmailLabels } from '../api/gmail.api'
import { gmailKeys } from './queryKeys'

export interface GmailLabelsState {
  labels: GmailLabel[]
  isLoading: boolean
  error: string | null
}

export function useGmailLabels( { enabled }: { enabled: boolean } ): GmailLabelsState {
  const { data, error, isPending } = useQuery( {
    queryKey: gmailKeys.labels,
    queryFn: listGmailLabels,
    enabled,
  } )

  return {
    labels: data ?? [],
    isLoading: enabled && isPending,
    error: error === null ? null : error.message,
  }
}
