// Shared
import { Me, VaultChoice } from '@atlas/shared'
// App
import { ApiError } from './apiError'
import { request } from './request'

// A signed-out visitor is a normal answer here, not a failure: it is what shows the sign-in page.
export const getMe = async (): Promise< Me | null > => {
  try {
    return await request( '/api/me', Me )
  } catch( error ) {
    if( error instanceof ApiError && error.status === 401 ) {
      return null
    }

    throw error
  }
}

export const listVaults = async (): Promise< VaultChoice > => {
  return request( '/api/me/vaults', VaultChoice )
}

const postVault = async ( path: string, vaultDir: string ): Promise< Me > => {
  return request( path, Me, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( { vault_dir: vaultDir } ),
  } )
}

export const claimVault = async ( vaultDir: string ): Promise< Me > => {
  return postVault( '/api/me/vault', vaultDir )
}

export const createVault = async ( vaultDir: string ): Promise< Me > => {
  return postVault( '/api/me/vault/new', vaultDir )
}
