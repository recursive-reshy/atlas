// Shared
import {
  GmailSourceResponse,
  ListGmailSourcesResponse,
  PreviewGmailSourceResponse,
} from '@atlas/shared'
import type {
  CreateGmailSourceBody,
  GmailMatch,
  GmailSource,
  UpdateGmailSourceBody,
} from '@atlas/shared'
// App
import { request, send } from './request'

const sourcePath = ( id: string ): string => `/api/gmail/sources/${ encodeURIComponent( id ) }`

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const listGmailSources = async (): Promise< GmailSource[] > => {
  const { sources } = await request( '/api/gmail/sources', ListGmailSourcesResponse )
  return sources
}

export const previewGmailSource = async (
  match: GmailMatch,
): Promise< PreviewGmailSourceResponse > => {
  return request(
    '/api/gmail/sources/preview',
    PreviewGmailSourceResponse,
    jsonInit( 'POST', { match } ),
  )
}

export const createGmailSource = async (
  body: CreateGmailSourceBody,
): Promise< GmailSource > => {
  const { source } = await request(
    '/api/gmail/sources',
    GmailSourceResponse,
    jsonInit( 'POST', body ),
  )
  return source
}

export const updateGmailSource = async (
  id: string,
  body: UpdateGmailSourceBody,
): Promise< GmailSource > => {
  const { source } = await request(
    sourcePath( id ),
    GmailSourceResponse,
    jsonInit( 'PATCH', body ),
  )
  return source
}

export const deleteGmailSource = async (
  id: string,
  removeInboxItems: boolean,
): Promise< void > => {
  const query = `remove_inbox_items=${ removeInboxItems }`

  await send( `${ sourcePath( id ) }?${ query }`, { method: 'DELETE' } )
}

export const checkGmailSource = async ( id: string ): Promise< GmailSource > => {
  const { source } = await request(
    `${ sourcePath( id ) }/check`,
    GmailSourceResponse,
    { method: 'POST' },
  )
  return source
}

export const checkAllGmailSources = async (): Promise< GmailSource[] > => {
  const { sources } = await request(
    '/api/gmail/sources/check',
    ListGmailSourcesResponse,
    { method: 'POST' },
  )
  return sources
}
