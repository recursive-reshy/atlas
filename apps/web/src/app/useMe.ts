// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { Me } from '@atlas/shared'
// App
import { getMe } from './me.api'
import { meKeys } from '../lib/queryKeys'

export interface MeState {
  me: Me | null
  isLoading: boolean
  error: string | null
}

// `me` is null when nobody is signed in; that is not an error.
export function useMe(): MeState {
  const { data, error, isPending } = useQuery( { queryKey: meKeys.all, queryFn: getMe } )

  return {
    me: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
