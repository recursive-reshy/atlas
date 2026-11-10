// Packages
import { keepPreviousData, useQuery } from '@tanstack/react-query'
// Shared
import type { UsageResponse } from '@atlas/shared'
// App
import { getUsage } from '../api/admin.api'
import { adminKeys } from '../lib/queryKeys'

export interface AdminUsageState {
  usage: UsageResponse | null
  isLoading: boolean
  error: string | null
}

// `null` is the current month, which the server works out in its own time zone.
export function useAdminUsage( month: string | null ): AdminUsageState {
  const { data, error, isPending } = useQuery( {
    queryKey: adminKeys.usage( month ),
    queryFn: () => getUsage( month ?? undefined ),
    placeholderData: keepPreviousData,
  } )

  return {
    usage: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
