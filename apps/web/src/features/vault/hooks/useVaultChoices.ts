// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Me } from '@atlas/shared'
// App
import { claimVault, createVault, listVaults } from '#src/app/me.api'
import { meKeys } from '#src/lib/queryKeys'

export interface VaultChoicesState {
  folders: string[]
  // False where the admin sets vaults up (VAULT_CREATE_ENABLED); true until the server says
  canCreate: boolean
  isLoading: boolean
  error: string | null
  claim: UseMutationResult< Me, Error, string >
  create: UseMutationResult< Me, Error, string >
}

export function useVaultChoices(): VaultChoicesState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( {
    queryKey: meKeys.vaults,
    queryFn: listVaults,
  } )
  // The response is the user with their vault, so the gate moves on without asking again (the
  // server refuses the folder list once a vault is chosen).
  const options = {
    onSuccess: ( me: Me ) => queryClient.setQueryData( meKeys.all, me ),
    // Someone may have taken the folder meanwhile.
    onError: () => queryClient.invalidateQueries( { queryKey: meKeys.vaults } ),
  }
  const claim = useMutation( {
    mutationFn: ( vaultDir: string ) => claimVault( vaultDir ),
    ...options,
  } )
  const create = useMutation( {
    mutationFn: ( vaultDir: string ) => createVault( vaultDir ),
    ...options,
  } )

  return {
    folders: data?.folders ?? [],
    canCreate: data?.can_create ?? true,
    isLoading: isPending,
    error: error === null ? null : error.message,
    claim,
    create,
  }
}
