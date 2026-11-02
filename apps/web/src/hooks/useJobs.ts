// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { Job } from '@atlas/shared'
// App
import { listJobs } from '../api/jobs.api'
import { jobKeys } from './queryKeys'

export const FAST_POLL_MS = 2000
export const SLOW_POLL_MS = 30_000

const IN_PROGRESS_STATUSES: Job[ 'status' ][] = [
  'queued',
  'downloading',
  'converting',
  'transcribing',
  'summarizing',
]

export interface JobsState {
  jobs: Job[] | null
  error: string | null
  updatedAt: number
}

export function useJobs(): JobsState {
  const { data, error, dataUpdatedAt } = useQuery( {
    queryKey: jobKeys.all,
    queryFn: listJobs,
    refetchInterval: ( query ) => {
      const isBusy = query.state.data?.some( ( { status } ) => {
        return IN_PROGRESS_STATUSES.includes( status )
      } )

      return isBusy === true ? FAST_POLL_MS : SLOW_POLL_MS
    },
  } )

  return {
    jobs: data ?? null,
    error: error === null ? null : error.message,
    updatedAt: dataUpdatedAt,
  }
}
