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
export function useNextReview( subjectId: string | null ): NextReviewState {
  const { data, error, isPending } = useQuery( {
    queryKey: meleteKeys.review( subjectId ),
    queryFn: () => getNextReview( subjectId ),
    gcTime: 0,
  } )

  return {
    item: data?.item ?? null,
    counts: data?.counts ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
