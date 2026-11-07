// Shared
import type { GetMeleteNoteResponse, OffSyllabusActionBody } from '@atlas/shared'
// App
import { applyOffSyllabusAction, setNoteConcepts } from '../api/melete.api'
import { useNoteResponse } from './useNoteResponse'
import type { Mutation } from './useNoteResponse'

export function useSetNoteConcepts(): Mutation<
  { id: string, conceptIds: string[] },
  GetMeleteNoteResponse
> {
  return useNoteResponse(
    ( { id, conceptIds }: { id: string, conceptIds: string[] } ) => {
      return setNoteConcepts( id, conceptIds )
    },
    ( { id } ) => id,
  )
}

// Adding a concept changes the syllabus too; it sits under the subject key, so it is refreshed
// with the subject
export function useOffSyllabusAction(): Mutation<
  { id: string, body: OffSyllabusActionBody },
  GetMeleteNoteResponse
> {
  return useNoteResponse(
    ( { id, body }: { id: string, body: OffSyllabusActionBody } ) => {
      return applyOffSyllabusAction( id, body )
    },
    ( { id } ) => id,
  )
}
