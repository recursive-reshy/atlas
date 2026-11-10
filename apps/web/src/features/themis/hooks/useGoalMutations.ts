// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  CreateGoalBody,
  LogMetricBody,
  ThemisArea,
  ThemisGoal,
  ThemisLinkedSubject,
  ThemisMetricUpdate,
  UpdateAreaBody,
  UpdateGoalBody,
} from '@atlas/shared'
// App
import {
  createGoal,
  deleteArea,
  deleteGoal,
  logMetric,
  setGoalSubjects,
  updateArea,
  updateGoal,
} from '../api/themis.api'
import { meleteKeys, themisKeys } from '#src/lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// Themis numbers all come from one overview, so any change refreshes all of it
const useRefresh = ( withMelete = false ): () => Promise< unknown > => {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries( { queryKey: themisKeys.all } )

    // A subject card shows its goal, so linking and unlinking changes Melete's reads too
    if( withMelete ) {
      await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
    }
  }
}

export function useUpdateArea(): Mutation< { id: string, body: UpdateAreaBody }, ThemisArea > {
  return useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateAreaBody } ) => updateArea( id, body ),
    onSuccess: useRefresh(),
  } )
}

export function useDeleteArea(): Mutation< string, void > {
  return useMutation( { mutationFn: ( id: string ) => deleteArea( id ), onSuccess: useRefresh() } )
}

export function useCreateGoal(): Mutation< CreateGoalBody, ThemisGoal > {
  return useMutation( {
    mutationFn: ( body: CreateGoalBody ) => createGoal( body ),
    onSuccess: useRefresh(),
  } )
}

export function useUpdateGoal(): Mutation< { id: string, body: UpdateGoalBody }, ThemisGoal > {
  return useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateGoalBody } ) => updateGoal( id, body ),
    onSuccess: useRefresh( true ),
  } )
}

export function useDeleteGoal(): Mutation< string, void > {
  return useMutation( {
    mutationFn: ( id: string ) => deleteGoal( id ),
    onSuccess: useRefresh( true ),
  } )
}

export function useLogMetric(): Mutation<
  { goalId: string, body: LogMetricBody },
  ThemisMetricUpdate
> {
  return useMutation( {
    mutationFn: ( { goalId, body }: { goalId: string, body: LogMetricBody } ) => {
      return logMetric( goalId, body )
    },
    onSuccess: useRefresh(),
  } )
}

export function useSetGoalSubjects(): Mutation<
  { goalId: string, subjectIds: string[] },
  ThemisLinkedSubject[]
> {
  return useMutation( {
    mutationFn: ( { goalId, subjectIds }: { goalId: string, subjectIds: string[] } ) => {
      return setGoalSubjects( goalId, subjectIds )
    },
    onSuccess: useRefresh( true ),
  } )
}
