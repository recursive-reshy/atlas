// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  CreateGmailSourceBody,
  GmailSource,
  UpdateGmailSourceBody,
} from '@atlas/shared'
// App
import {
  checkAllGmailSources,
  checkGmailSource,
  createGmailSource,
  deleteGmailSource,
  listGmailSources,
  updateGmailSource,
} from '../api/gmailSources.api'
import { gmailKeys, inboxKeys, jobKeys } from '../lib/queryKeys'

type Mutation< Variables, Result = GmailSource > = UseMutationResult< Result, Error, Variables >

export interface GmailSourcesState {
  sources: GmailSource[]
  isLoading: boolean
  error: string | null
  updatedAt: number
  createSource: Mutation< CreateGmailSourceBody >
  updateSource: Mutation< { id: string, body: UpdateGmailSourceBody } >
  deleteSource: Mutation< { id: string, removeInboxItems: boolean }, void >
  checkSource: Mutation< string >
  checkAllSources: Mutation< void, GmailSource[] >
}

export function useGmailSources(): GmailSourcesState {
  const queryClient = useQueryClient()
  const { data, error, isPending, dataUpdatedAt } = useQuery( {
    queryKey: gmailKeys.sources,
    queryFn: listGmailSources,
  } )

  // A change to a source can add or remove inbox items (and collected jobs), so those are
  // refreshed with it.
  const refresh = async (): Promise< void > => {
    await Promise.all( [
      queryClient.invalidateQueries( { queryKey: gmailKeys.sources } ),
      queryClient.invalidateQueries( { queryKey: inboxKeys.all } ),
      queryClient.invalidateQueries( { queryKey: jobKeys.all } ),
    ] )
  }

  const create = useMutation( {
    mutationFn: ( body: CreateGmailSourceBody ) => createGmailSource( body ),
    onSuccess: refresh,
  } )
  const update = useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateGmailSourceBody } ) => {
      return updateGmailSource( id, body )
    },
    onSuccess: refresh,
  } )
  const remove = useMutation( {
    mutationFn: ( { id, removeInboxItems }: { id: string, removeInboxItems: boolean } ) => {
      return deleteGmailSource( id, removeInboxItems )
    },
    onSuccess: refresh,
  } )
  const check = useMutation( {
    mutationFn: ( id: string ) => checkGmailSource( id ),
    onSuccess: refresh,
  } )
  const checkAll = useMutation( {
    mutationFn: () => checkAllGmailSources(),
    onSuccess: refresh,
  } )

  return {
    sources: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
    updatedAt: dataUpdatedAt,
    createSource: create,
    updateSource: update,
    deleteSource: remove,
    checkSource: check,
    checkAllSources: checkAll,
  }
}
