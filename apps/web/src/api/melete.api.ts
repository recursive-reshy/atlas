// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  GetNextReviewResponse,
  GradeAnswerResponse,
  RecordReviewResponse,
} from '@atlas/shared'
import type {
  GradeAnswerBody,
  MeleteQuestion,
  OffSyllabusActionBody,
  MeleteSubject,
  RecordReviewBody,
  UpdateMeleteSubjectBody,
} from '@atlas/shared'
// App
import { request } from './request'

// The two single-entity responses have no schema of their own; these pick the key out of the
// full responses' schemas.
const SubjectOnly = GetMeleteSubjectResponse.pick( { subject: true } )
const QuestionOnly = RecordReviewResponse.pick( { question: true } )

const subjectPath = ( id: string ): string => `/api/melete/subjects/${ encodeURIComponent( id ) }`
const notePath = ( id: string ): string => `/api/melete/notes/${ encodeURIComponent( id ) }`
const questionPath = ( id: string ): string => {
  return `/api/melete/questions/${ encodeURIComponent( id ) }`
}

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const getMeleteToday = async (): Promise< GetMeleteTodayResponse > => {
  return request( '/api/melete/today', GetMeleteTodayResponse )
}

export const getMeleteSubject = async ( id: string ): Promise< GetMeleteSubjectResponse > => {
  return request( subjectPath( id ), GetMeleteSubjectResponse )
}

export const updateMeleteSubject = async (
  id: string,
  body: UpdateMeleteSubjectBody,
): Promise< MeleteSubject > => {
  const { subject } = await request( subjectPath( id ), SubjectOnly, jsonInit( 'PATCH', body ) )
  return subject
}

export const enrollSubject = async (
  id: string,
  enrolled: boolean,
): Promise< GetMeleteSubjectResponse > => {
  return request(
    `${ subjectPath( id ) }/enrollment`,
    GetMeleteSubjectResponse,
    jsonInit( 'POST', { enrolled } ),
  )
}

export const getMeleteNote = async ( id: string ): Promise< GetMeleteNoteResponse > => {
  return request( notePath( id ), GetMeleteNoteResponse )
}

export const setNoteEnrolled = async (
  id: string,
  enrolled: boolean,
): Promise< GetMeleteNoteResponse > => {
  return request( notePath( id ), GetMeleteNoteResponse, jsonInit( 'PATCH', { enrolled } ) )
}

export const regenerateNote = async ( id: string ): Promise< GetMeleteNoteResponse > => {
  return request( `${ notePath( id ) }/regenerate`, GetMeleteNoteResponse, { method: 'POST' } )
}

export const retryGeneration = async ( id: string ): Promise< GetMeleteNoteResponse > => {
  return request( `${ notePath( id ) }/retry`, GetMeleteNoteResponse, { method: 'POST' } )
}

export const setNoteConcepts = async (
  id: string,
  conceptIds: string[],
): Promise< GetMeleteNoteResponse > => {
  return request(
    `${ notePath( id ) }/concepts`,
    GetMeleteNoteResponse,
    jsonInit( 'PUT', { concept_ids: conceptIds } ),
  )
}

export const applyOffSyllabusAction = async (
  id: string,
  body: OffSyllabusActionBody,
): Promise< GetMeleteNoteResponse > => {
  return request(
    `${ notePath( id ) }/off-syllabus`,
    GetMeleteNoteResponse,
    jsonInit( 'POST', body ),
  )
}

export const dropQuestion = async ( id: string ): Promise< MeleteQuestion > => {
  const { question } = await request(
    `${ questionPath( id ) }/drop`,
    QuestionOnly,
    { method: 'POST' },
  )
  return question
}

export const getNextReview = async (
  subjectId: string | null,
  conceptId?: string,
): Promise< GetNextReviewResponse > => {
  const parts = [
    ...subjectId === null ? [] : [ `subject=${ encodeURIComponent( subjectId ) }` ],
    ...conceptId === undefined ? [] : [ `concept=${ encodeURIComponent( conceptId ) }` ],
  ]
  const query = parts.length === 0 ? '' : `?${ parts.join( '&' ) }`

  return request( `/api/melete/review/next${ query }`, GetNextReviewResponse )
}

export const gradeAnswer = async (
  questionId: string,
  body: GradeAnswerBody,
): Promise< GradeAnswerResponse > => {
  return request(
    `${ questionPath( questionId ) }/grade`,
    GradeAnswerResponse,
    jsonInit( 'POST', body ),
  )
}

export const recordReview = async (
  questionId: string,
  body: RecordReviewBody,
): Promise< RecordReviewResponse > => {
  return request(
    `${ questionPath( questionId ) }/review`,
    RecordReviewResponse,
    jsonInit( 'POST', body ),
  )
}
