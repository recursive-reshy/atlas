// Shared
import { GetMeleteGapsResponse, SuggestMeleteResourcesResponse } from '@atlas/shared'
// App
import { request } from '#src/lib/request'

export const getMeleteGaps = async ( subjectId: string ): Promise< GetMeleteGapsResponse > => {
  return request(
    `/api/melete/subjects/${ encodeURIComponent( subjectId ) }/gaps`,
    GetMeleteGapsResponse,
  )
}

// Answered on the spot and not stored; the server can take up to a minute
export const suggestResources = async (
  conceptId: string,
): Promise< SuggestMeleteResourcesResponse > => {
  return request(
    `/api/melete/concepts/${ encodeURIComponent( conceptId ) }/suggestions`,
    SuggestMeleteResourcesResponse,
    { method: 'POST' },
  )
}
