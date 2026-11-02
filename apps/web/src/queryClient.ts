// Packages
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
// Shared
import { VAULT_MISSING_MESSAGE } from '@atlas/shared'
// App
import { ApiError } from './api/apiError'
import { meKeys } from './hooks/queryKeys'

export const createQueryClient = (): QueryClient => {
  // A 401 from any request means the session ended, and the 409 "vault folder is missing" means the
  // user's vault has gone (ADR 0070): ask for the user again, and the gate shows the sign-in page
  // or the vault page.
  const handleError = ( error: Error ): void => {
    const isSessionEnded = error instanceof ApiError && error.status === 401
    const isVaultMissing = error instanceof ApiError
      && error.status === 409
      && error.message === VAULT_MISSING_MESSAGE

    if( isSessionEnded || isVaultMissing ) {
      void client.invalidateQueries( { queryKey: meKeys.all } )
    }
  }

  const client: QueryClient = new QueryClient( {
    queryCache: new QueryCache( { onError: handleError } ),
    mutationCache: new MutationCache( { onError: handleError } ),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  } )

  return client
}
