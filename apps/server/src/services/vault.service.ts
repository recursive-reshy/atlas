// Node
import { lstatSync } from 'node:fs'
import { join } from 'node:path'
// Shared
import { ListFoldersResponse } from '@atlas/shared'
// Clients
import { listFolderTree } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError, VaultMissingError, VaultNotChosenError } from '../errors.js'
// Logger
import { logger } from '../logger.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'

// True when a vault is chosen but its folder is gone, or has been replaced by a file or a symlink
// (a symlink could lead out of the vaults folder). A user with no vault is not missing one.
export const vaultFolderMissing = ( vaultDir: string | null ): boolean => {
  if( vaultDir === null ) {
    return false
  }

  try {
    return !lstatSync( join( config.vaultsPath, vaultDir ) ).isDirectory()
  } catch( error ) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined

    // Anything else (no permission, say) is a real fault, not a vault that has gone
    if( code === 'ENOENT' || code === 'ENOTDIR' ) {
      return true
    }

    throw error
  }
}

export const vaultRootFor = ( userId: string ): string => {
  const user = findUserById( userId )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.vault_dir === null ) {
    throw new VaultNotChosenError()
  }

  if( vaultFolderMissing( user.vault_dir ) ) {
    throw new VaultMissingError()
  }

  return join( config.vaultsPath, user.vault_dir )
}

// The name Obsidian gives the user's vault is its folder's name (ADR 0063). No `lstat`: a link to a
// vault that has gone missing is harmless.
export const vaultDirFor = ( userId: string ): string | null => {
  return findUserById( userId )?.vault_dir ?? null
}

export const vaultIsMissing = ( userId: string ): boolean => {
  return vaultFolderMissing( findUserById( userId )?.vault_dir ?? null )
}

export const listFolders = async ( userId: string ): Promise< ListFoldersResponse > => {
  return {
    default_folder: config.defaultNoteFolder,
    folders: await listFolderTree( vaultRootFor( userId ), '', ( path, code ) => {
      logger.warn(
        { user_id: userId, path, code },
        'Skipped a vault folder that could not be read',
      )
    } ),
  }
}
