// Shared
import {
  ApproveMeleteSyllabusResponse,
  MeleteSyllabus,
  SaveMeleteSyllabusResponse,
} from '@atlas/shared'
import type { MeleteSubject, MeleteSyllabusEdit } from '@atlas/shared'
// App
import { request } from '#src/lib/request'

const syllabusPath = ( subjectId: string ): string => {
  return `/api/melete/subjects/${ encodeURIComponent( subjectId ) }/syllabus`
}

export const getMeleteSyllabus = async ( subjectId: string ): Promise< MeleteSyllabus > => {
  return request( syllabusPath( subjectId ), MeleteSyllabus )
}

export const saveMeleteSyllabus = async (
  subjectId: string,
  edit: MeleteSyllabusEdit,
): Promise< SaveMeleteSyllabusResponse > => {
  return request( syllabusPath( subjectId ), SaveMeleteSyllabusResponse, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( edit ),
  } )
}

// Drafting only queues the call; the subject comes back `drafting` and the page polls
export const draftMeleteSyllabus = async ( subjectId: string ): Promise< MeleteSubject > => {
  const { subject } = await request(
    `${ syllabusPath( subjectId ) }/draft`,
    ApproveMeleteSyllabusResponse,
    { method: 'POST' },
  )

  return subject
}

export const approveMeleteSyllabus = async ( subjectId: string ): Promise< MeleteSubject > => {
  const { subject } = await request(
    `${ syllabusPath( subjectId ) }/approve`,
    ApproveMeleteSyllabusResponse,
    { method: 'POST' },
  )

  return subject
}
