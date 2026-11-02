// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { Job } from '@atlas/shared'
// App
import { ApiError } from '../api/apiError'
import { getJob } from '../api/jobs.api'
import { jobKeys } from './queryKeys'

export const POLL_INTERVAL_MS = 2000

const FINISHED_STATUSES: Job[ 'status' ][] = [
  'ready_for_review',
  'summary_failed',
  'saved',
  'failed',
]

const JOB_GONE_MESSAGE = 'This job no longer exists. The server may have restarted.'

export interface JobState {
  job: Job | null
  error: string | null
}

const isGone = ( error: unknown ): boolean => {
  return error instanceof ApiError && error.status === 404
}

export function useJob( jobId: string | null ): JobState {
  const { data, error } = useQuery( {
    queryKey: jobKeys.detail( jobId ?? '' ),
    queryFn: () => getJob( jobId ?? '' ),
    enabled: jobId !== null,
    refetchInterval: ( query ) => {
      if( isGone( query.state.error ) ) {
        return false
      }

      const status = query.state.data?.status

      return status !== undefined && FINISHED_STATUSES.includes( status )
        ? false
        : POLL_INTERVAL_MS
    },
  } )

  const hasVanished = isGone( error )

  if( jobId === null ) {
    return { job: null, error: null }
  }

  if( hasVanished ) {
    return { job: null, error: JOB_GONE_MESSAGE }
  }

  if( error !== null ) {
    const message = error instanceof Error ? error.message : 'Unexpected error'

    return { job: data ?? null, error: message }
  }

  return { job: data ?? null, error: null }
}
