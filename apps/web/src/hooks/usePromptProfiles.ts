// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { CreatePromptProfileBody, PromptProfile } from '@atlas/shared'
// App
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  resetProfile,
  restoreVersion,
  saveVersion,
} from '../api/prompts.api'
import { promptKeys } from '../lib/queryKeys'

type Mutation< Variables, Result = PromptProfile > = UseMutationResult< Result, Error, Variables >

export interface PromptProfilesState {
  profiles: PromptProfile[]
  isLoading: boolean
  error: string | null
  createProfile: Mutation< CreatePromptProfileBody >
  renameProfile: Mutation< { id: string, name: string } >
  deleteProfile: Mutation< string, void >
  saveVersion: Mutation< { id: string, guidance: string } >
  restoreVersion: Mutation< { id: string, versionId: number } >
  resetProfile: Mutation< string >
}

export function usePromptProfiles(): PromptProfilesState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( {
    queryKey: promptKeys.profiles,
    queryFn: () => listProfiles(),
  } )

  // The profiles key is a prefix of every profile's versions key, so one call refreshes both.
  const refresh = async (): Promise< void > => {
    await queryClient.invalidateQueries( { queryKey: promptKeys.profiles } )
  }

  const create = useMutation( {
    mutationFn: ( body: CreatePromptProfileBody ) => createProfile( body ),
    onSuccess: refresh,
  } )
  const rename = useMutation( {
    mutationFn: ( { id, name }: { id: string, name: string } ) => renameProfile( id, name ),
    onSuccess: refresh,
  } )
  const remove = useMutation( {
    mutationFn: ( id: string ) => deleteProfile( id ),
    onSuccess: refresh,
  } )
  const save = useMutation( {
    mutationFn: ( { id, guidance }: { id: string, guidance: string } ) => {
      return saveVersion( id, guidance )
    },
    onSuccess: refresh,
  } )
  const restore = useMutation( {
    mutationFn: ( { id, versionId }: { id: string, versionId: number } ) => {
      return restoreVersion( id, versionId )
    },
    onSuccess: refresh,
  } )
  const reset = useMutation( {
    mutationFn: ( id: string ) => resetProfile( id ),
    onSuccess: refresh,
  } )

  return {
    profiles: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
    createProfile: create,
    renameProfile: rename,
    deleteProfile: remove,
    saveVersion: save,
    restoreVersion: restore,
    resetProfile: reset,
  }
}
