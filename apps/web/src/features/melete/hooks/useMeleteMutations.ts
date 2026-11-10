// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GradeAnswerBody,
  GradeAnswerResponse,
  MeleteQuestion,
  RecordReviewBody,
  RecordReviewResponse,
  UpdateMeleteSubjectBody,
} from '@atlas/shared'
// App
import {
  dropQuestion,
  enrollSubject,
  gradeAnswer,
  recordReview,
  regenerateNote,
  retryGeneration,
  setNoteEnrolled,
  updateMeleteSubject,
} from '../api/melete.api'
import { meleteKeys } from '#src/lib/queryKeys'
import { useNoteResponse } from './useNoteResponse'

type Mutation< Variables, Result > = UseMutationResult< Result, Error, Variables >

export function useEnrollSubject(): Mutation<
  { id: string, enrolled: boolean },
  GetMeleteSubjectResponse
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { id, enrolled }: { id: string, enrolled: boolean } ) => {
      return enrollSubject( id, enrolled )
    },
    onSuccess: async ( response, { id } ) => {
      queryClient.setQueryData( meleteKeys.subject( id ), response )
      await queryClient.invalidateQueries( { queryKey: meleteKeys.today } )
    },
  } )
}

export function useUpdateSubject(): Mutation<
  { id: string, body: UpdateMeleteSubjectBody },
  Awaited< ReturnType< typeof updateMeleteSubject > >
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { id, body }: { id: string, body: UpdateMeleteSubjectBody } ) => {
      return updateMeleteSubject( id, body )
    },
    onSuccess: async ( subject, { id } ) => {
      queryClient.setQueryData< GetMeleteSubjectResponse >(
        meleteKeys.subject( id ),
        ( current ) => current === undefined ? current : { ...current, subject },
      )
      await queryClient.invalidateQueries( { queryKey: meleteKeys.today } )
    },
  } )
}

export function useSetNoteEnrolled(): Mutation<
  { id: string, enrolled: boolean },
  GetMeleteNoteResponse
> {
  return useNoteResponse(
    ( { id, enrolled }: { id: string, enrolled: boolean } ) => setNoteEnrolled( id, enrolled ),
    ( { id } ) => id,
  )
}

export function useRegenerateNote(): Mutation< string, GetMeleteNoteResponse > {
  return useNoteResponse( ( id: string ) => regenerateNote( id ), ( id ) => id )
}

export function useRetryGeneration(): Mutation< string, GetMeleteNoteResponse > {
  return useNoteResponse( ( id: string ) => retryGeneration( id ), ( id ) => id )
}

export function useDropQuestion(): Mutation< string, MeleteQuestion > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( questionId: string ) => dropQuestion( questionId ),
    onSuccess: async ( question ) => {
      queryClient.setQueryData< GetMeleteNoteResponse >(
        meleteKeys.note( question.note_id ),
        ( current ) => current === undefined ? current : {
          ...current,
          questions: current.questions.map( ( item ) => item.id === question.id ? question : item ),
        },
      )
      await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
    },
  } )
}

export function useGradeAnswer(): Mutation<
  { questionId: string, body: GradeAnswerBody },
  GradeAnswerResponse
> {
  return useMutation( {
    mutationFn: ( { questionId, body }: { questionId: string, body: GradeAnswerBody } ) => {
      return gradeAnswer( questionId, body )
    },
  } )
}

export function useRecordReview(): Mutation<
  { questionId: string, body: RecordReviewBody },
  RecordReviewResponse
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( { questionId, body }: { questionId: string, body: RecordReviewBody } ) => {
      return recordReview( questionId, body )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries( { queryKey: meleteKeys.all } )
    },
  } )
}
