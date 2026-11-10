// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { AdminUser, CreateUserBody, UpdateUserBody } from '@atlas/shared'
// App
import {
  createUser,
  deleteUser,
  listUsers,
  resetVault,
  updateUser,
} from '../api/admin.api'
import { adminKeys } from '../lib/queryKeys'

type Mutation< Variables, Result = AdminUser > = UseMutationResult< Result, Error, Variables >

export interface AdminUsersState {
  users: AdminUser[]
  isLoading: boolean
  error: string | null
  createUser: Mutation< CreateUserBody >
  updateUser: Mutation< { id: string, body: UpdateUserBody } >
  resetVault: Mutation< string >
  deleteUser: Mutation< { id: string, confirm: string }, void >
}

export function useAdminUsers(): AdminUsersState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( { queryKey: adminKeys.users, queryFn: listUsers } )
  // Users and usage are both under the admin key: usage lists every user too.
  const options = {
    onSuccess: () => queryClient.invalidateQueries( { queryKey: adminKeys.all } ),
  }

  return {
    users: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
    createUser: useMutation( {
      mutationFn: ( body: CreateUserBody ) => createUser( body ),
      ...options,
    } ),
    updateUser: useMutation( {
      mutationFn: ( { id, body }: { id: string, body: UpdateUserBody } ) => updateUser( id, body ),
      ...options,
    } ),
    resetVault: useMutation( { mutationFn: ( id: string ) => resetVault( id ), ...options } ),
    deleteUser: useMutation( {
      mutationFn: ( { id, confirm }: { id: string, confirm: string } ) => deleteUser( id, confirm ),
      ...options,
    } ),
  }
}
