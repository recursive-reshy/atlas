// Packages
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { SuggestMeleteResourcesResponse } from '@atlas/shared'
// App
import { suggestResources } from '../api/gaps.api'

// The answer is not stored on the server, so it stays with the component that asked
export function useSuggestResources(): UseMutationResult<
  SuggestMeleteResourcesResponse,
  Error,
  string
> {
  return useMutation( { mutationFn: ( conceptId: string ) => suggestResources( conceptId ) } )
}
