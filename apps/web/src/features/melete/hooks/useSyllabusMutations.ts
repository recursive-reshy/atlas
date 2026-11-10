// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  GetMeleteSubjectResponse,
  MeleteSubject,
  MeleteSyllabusEdit,
  SaveMeleteSyllabusResponse,
} from '@atlas/shared'
// App
import {
  approveMeleteSyllabus,
  draftMeleteSyllabus,
  saveMeleteSyllabus,
} from '../api/syllabus.api'
import { meleteKeys } from '#src/lib/queryKeys'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

// The server answers with the subject; its notes stay as they were until the next poll
const storeSubject = async (
  queryClient: QueryClient,
  subject: MeleteSubject,
): Promise< void > => {
  queryClient.setQueryData< GetMeleteSubjectResponse >(
    meleteKeys.subject( subject.id ),
    ( current ) => current === undefined ? current : { ...current, subject },
  )
  await Promise.all( [
    queryClient.invalidateQueries( { queryKey: meleteKeys.today } ),
    queryClient.invalidateQueries( { queryKey: meleteKeys.syllabus( subject.id ) } ),
  ] )
}

export function useDraftSyllabus(): Mutation< string, MeleteSubject > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( id: string ) => draftMeleteSyllabus( id ),
    onSuccess: ( subject ) => storeSubject( queryClient, subject ),
  } )
}

export function useApproveSyllabus(): Mutation< string, MeleteSubject > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( id: string ) => approveMeleteSyllabus( id ),
    onSuccess: ( subject ) => storeSubject( queryClient, subject ),
  } )
}

export function useSaveSyllabus(): Mutation<
  { id: string, edit: MeleteSyllabusEdit },
  SaveMeleteSyllabusResponse
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { id, edit }: { id: string, edit: MeleteSyllabusEdit } ) => {
      return saveMeleteSyllabus( id, edit )
    },
    onSuccess: async ( { syllabus }, { id } ) => {
      queryClient.setQueryData( meleteKeys.syllabus( id ), syllabus )
      await queryClient.invalidateQueries( { queryKey: meleteKeys.subject( id ), exact: true } )
    },
  } )
}
