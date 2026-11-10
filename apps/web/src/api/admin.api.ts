// Shared
import { AdminUser, UsageResponse } from '@atlas/shared'
import type { CreateUserBody, UpdateUserBody } from '@atlas/shared'
// App
import { request, send } from '../lib/request'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const userPath = ( id: string ): string => `/api/admin/users/${ id }`

export const listUsers = async (): Promise< AdminUser[] > => {
  return request( '/api/admin/users', AdminUser.array() )
}

export const createUser = async ( body: CreateUserBody ): Promise< AdminUser > => {
  return request( '/api/admin/users', AdminUser, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify( body ),
  } )
}

export const updateUser = async ( id: string, body: UpdateUserBody ): Promise< AdminUser > => {
  return request( userPath( id ), AdminUser, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify( body ),
  } )
}

export const resetVault = async ( id: string ): Promise< AdminUser > => {
  return request( `${ userPath( id ) }/reset-vault`, AdminUser, { method: 'POST' } )
}

export const deleteUser = async ( id: string, confirm: string ): Promise< void > => {
  await send( userPath( id ), {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify( { confirm } ),
  } )
}

export const getUsage = async ( month?: string ): Promise< UsageResponse > => {
  const query = month === undefined ? '' : `?month=${ month }`

  return request( `/api/admin/usage${ query }`, UsageResponse )
}
