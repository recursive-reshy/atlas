// Shared
import {
  GetJobResponse,
  LinkSuggestionsResponse,
  ListLinkSuggestionsResponse,
} from '@atlas/shared'
import type {
  AcceptLinkSuggestionsBody,
  Job,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  StoredLinkSuggestion,
} from '@atlas/shared'
// App
import { request } from './request'

const jobPath = ( id: string ): string => `/api/jobs/${ encodeURIComponent( id ) }`

const post = ( body: unknown ): RequestInit => ( {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify( body ),
} )

export const listLinkSuggestions = async ( id: string ): Promise< StoredLinkSuggestion[] > => {
  const { suggestions } = await request(
    `${ jobPath( id ) }/link-suggestions`,
    ListLinkSuggestionsResponse,
  )
  return suggestions
}

export const acceptLinkSuggestions = (
  id: string,
  body: AcceptLinkSuggestionsBody,
): Promise< LinkSuggestionsResponse > => {
  return request(
    `${ jobPath( id ) }/link-suggestions/accept`,
    LinkSuggestionsResponse,
    post( body ),
  )
}

export const rejectLinkSuggestions = (
  id: string,
  body: RejectLinkSuggestionsBody,
): Promise< LinkSuggestionsResponse > => {
  return request(
    `${ jobPath( id ) }/link-suggestions/reject`,
    LinkSuggestionsResponse,
    post( body ),
  )
}

export const runLinking = async ( id: string, body: RunLinkingBody ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/linking`, GetJobResponse, post( body ) )
  return job
}
