// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { GetMeleteNoteResponse } from '@atlas/shared'
// App
import { meleteKeys } from '#src/lib/queryKeys'

export type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// A note's change moves its subject's list and Today's counts, so both are refreshed.
export const useNoteResponse = < Variables >(
  mutationFn: ( variables: Variables ) => Promise< GetMeleteNoteResponse >,
  noteIdOf: ( variables: Variables ) => string,
): Mutation< Variables, GetMeleteNoteResponse > => {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn,
    onSuccess: async ( response, variables ) => {
      queryClient.setQueryData( meleteKeys.note( noteIdOf( variables ) ), response )
      await Promise.all( [
        queryClient.invalidateQueries( {
          queryKey: meleteKeys.subject( response.note.subject_id ),
        } ),
        queryClient.invalidateQueries( { queryKey: meleteKeys.today } ),
      ] )
    },
  } )
}

