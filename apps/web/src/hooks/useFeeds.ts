// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { CreateFeedBody, Feed, UpdateFeedBody } from '@atlas/shared'
// App
import {
  checkAllFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  updateFeed,
} from '../api/feeds.api'
import { feedKeys, inboxKeys } from '../lib/queryKeys'

type Mutation< Variables, Result = Feed > = UseMutationResult< Result, Error, Variables >

export interface FeedsState {
  feeds: Feed[]
  isLoading: boolean
  error: string | null
  updatedAt: number
  createFeed: Mutation< CreateFeedBody >
  updateFeed: Mutation< { id: string, body: UpdateFeedBody } >
  deleteFeed: Mutation< { id: string, removeItems: boolean }, void >
  checkFeed: Mutation< string >
  checkAllFeeds: Mutation< void, Feed[] >
}

export function useFeeds(): FeedsState {
  const queryClient = useQueryClient()
  const { data, error, isPending, dataUpdatedAt } = useQuery( {
    queryKey: feedKeys.all,
    queryFn: listFeeds,
  } )

  // A change to a feed can add or remove inbox items, so the inbox is refreshed with it.
  const refresh = async (): Promise< void > => {
    await Promise.all( [
      queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
      queryClient.invalidateQueries( { queryKey: inboxKeys.all } ),
    ] )
  }

  const create = useMutation( {
    mutationFn: ( body: CreateFeedBody ) => createFeed( body ),
    onSuccess: refresh,
  } )
  const update = useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateFeedBody } ) => updateFeed( id, body ),
    onSuccess: refresh,
  } )
  const remove = useMutation( {
    mutationFn: ( { id, removeItems }: { id: string, removeItems: boolean } ) => {
      return deleteFeed( id, removeItems )
    },
    onSuccess: refresh,
  } )
  const check = useMutation( {
    mutationFn: ( id: string ) => checkFeed( id ),
    onSuccess: refresh,
  } )
  const checkAll = useMutation( {
    mutationFn: () => checkAllFeeds(),
    onSuccess: refresh,
  } )

  return {
    feeds: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
    updatedAt: dataUpdatedAt,
    createFeed: create,
    updateFeed: update,
    deleteFeed: remove,
    checkFeed: check,
    checkAllFeeds: checkAll,
  }
}
