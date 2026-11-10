// Packages
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { PreviewFeedResponse } from '@atlas/shared'
// App
import { previewFeed } from '../api/feeds.api'

export function useFeedPreview(): UseMutationResult< PreviewFeedResponse, Error, string > {
  return useMutation( { mutationFn: ( url: string ) => previewFeed( url ) } )
}
