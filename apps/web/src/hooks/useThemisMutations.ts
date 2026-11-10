// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  AnswerCheckinBody,
  CreateAreaBody,
  ThemisArea,
  ThemisCheckin,
} from '@atlas/shared'
// App
import { answerCheckin, createArea } from '../api/themis.api'
import { themisKeys } from '../lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// Every change refreshes all of Themis: the overview and the goal pages share their numbers
export function useCreateArea(): Mutation< CreateAreaBody, ThemisArea > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: CreateAreaBody ) => createArea( body ),
    onSuccess: () => queryClient.invalidateQueries( { queryKey: themisKeys.all } ),
  } )
}

export function useAnswerCheckin(): Mutation<
  { goalId: string, body: AnswerCheckinBody },
  ThemisCheckin
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { goalId, body }: { goalId: string, body: AnswerCheckinBody } ) => {
      return answerCheckin( goalId, body )
    },
    onSuccess: () => queryClient.invalidateQueries( { queryKey: themisKeys.all } ),
  } )
}
