// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { MeleteReviewCounts, MeleteReviewItem } from '@atlas/shared'
// App
import { getNextReview } from '../api/melete.api'
import { meleteKeys } from './queryKeys'

export interface NextReviewState {
  item: MeleteReviewItem | null
  counts: MeleteReviewCounts | null
  isLoading: boolean
  error: string | null
}

// No polling: the item is fetched on mount and again after each recorded review.
// A concept review (`conceptId`) is the queue of that one concept, outside the day's limits.
export function useNextReview(
  subjectId: string | null,
  conceptId?: string | null,
): NextReviewState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.review( subjectId, conceptId ?? null ),
    queryFn: () => conceptId == null
      ? getNextReview( subjectId )
      : getNextReview( subjectId, conceptId ),
    gcTime: 0,
  } )

  return {
    item: data?.item ?? null,
    counts: data?.counts ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
