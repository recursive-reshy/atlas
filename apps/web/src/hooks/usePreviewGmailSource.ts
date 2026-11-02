// Packages
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { GmailMatch, PreviewGmailSourceResponse } from '@atlas/shared'
// App
import { previewGmailSource } from '../api/gmailSources.api'

export function usePreviewGmailSource(): UseMutationResult<
  PreviewGmailSourceResponse,
  Error,
  GmailMatch
> {
  return useMutation( { mutationFn: ( match: GmailMatch ) => previewGmailSource( match ) } )
}
