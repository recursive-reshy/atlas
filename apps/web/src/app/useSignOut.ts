// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// App
import { signOut } from './auth.api'
import { meKeys } from '../lib/queryKeys'

// Asking for the user again brings the sign-in page back, or shows why signing out failed.
export function useSignOut(): UseMutationResult< void, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => signOut(),
    onSettled: () => queryClient.invalidateQueries( { queryKey: meKeys.all } ),
  } )
}
