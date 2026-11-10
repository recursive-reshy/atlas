// Shared
import {
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  PromptProfileResponse,
} from '@atlas/shared'
import type {
  CreatePromptProfileBody,
  PromptProfile,
  PromptPurpose,
  PromptVersion,
} from '@atlas/shared'
// App
import { request, send } from '#src/lib/request'

const profilePath = ( id: string ): string => `/api/prompt-profiles/${ encodeURIComponent( id ) }`

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

// The server lists summary profiles unless asked for another purpose, or for 'all'.
export const listProfiles = async (
  purpose?: PromptPurpose | 'all',
): Promise< PromptProfile[] > => {
  const query = purpose === undefined ? '' : `?purpose=${ purpose }`
  const { profiles } = await request( `/api/prompt-profiles${ query }`, ListPromptProfilesResponse )
  return profiles
}

export const createProfile = async ( body: CreatePromptProfileBody ): Promise< PromptProfile > => {
  const { profile } = await request(
    '/api/prompt-profiles',
    PromptProfileResponse,
    jsonInit( 'POST', body ),
  )
  return profile
}

export const renameProfile = async ( id: string, name: string ): Promise< PromptProfile > => {
  const { profile } = await request(
    profilePath( id ),
    PromptProfileResponse,
    jsonInit( 'PATCH', { name } ),
  )
  return profile
}

export const deleteProfile = async ( id: string ): Promise< void > => {
  await send( profilePath( id ), { method: 'DELETE' } )
}

export const listVersions = async ( id: string ): Promise< PromptVersion[] > => {
  const { versions } = await request(
    `${ profilePath( id ) }/versions`,
    ListPromptVersionsResponse,
  )
  return versions
}

export const saveVersion = async ( id: string, guidance: string ): Promise< PromptProfile > => {
  const { profile } = await request(
    `${ profilePath( id ) }/versions`,
    PromptProfileResponse,
    jsonInit( 'POST', { guidance } ),
  )
  return profile
}

export const restoreVersion = async (
  id: string,
  versionId: number,
): Promise< PromptProfile > => {
  const { profile } = await request(
    `${ profilePath( id ) }/versions/${ versionId }/restore`,
    PromptProfileResponse,
    { method: 'POST' },
  )
  return profile
}

export const resetProfile = async ( id: string ): Promise< PromptProfile > => {
  const { profile } = await request(
    `${ profilePath( id ) }/reset`,
    PromptProfileResponse,
    { method: 'POST' },
  )
  return profile
}
