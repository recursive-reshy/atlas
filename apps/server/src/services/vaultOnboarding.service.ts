// Node
import {
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs'
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rmdir,
} from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import { VaultDir } from '@atlas/shared'
import type { VaultChoice } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'
// Errors
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Repositories
import {
  findUserById,
  listClaimedVaultDirs,
  setVaultDir,
} from '../repositories/users.repository.js'
// Services
import { vaultFolderMissing } from './vault.service.js'

// A user may choose when they have no vault, or when theirs has gone missing (ADR 0070).
// Returns the vault they have now, which `bind` replaces only if it is still that one.
const requireCanChoose = ( userId: string ): string | null => {
  const user = findUserById( userId )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.vault_dir !== null && !vaultFolderMissing( user.vault_dir ) ) {
    throw new ConflictError( 'You already have a vault' )
  }

  return user.vault_dir
}

// The unique column is what decides a race for a folder, and the compare-and-set on the old value
// decides a race between two choices by one user; the check before it only gives a friendlier
// message. There is no await between the two.
const bind = (
  userId: string,
  vaultDir: string,
  expected: string | null = requireCanChoose( userId ),
): void => {
  const result = setVaultDir( userId, vaultDir, expected )

  if( !result.ok ) {
    throw new ConflictError(
      result.reason === 'vault_taken' ? 'That vault is already taken' : 'You already have a vault',
    )
  }
}

export const listUnclaimedVaults = async ( userId: string ): Promise< VaultChoice > => {
  requireCanChoose( userId )

  const claimed = new Set( listClaimedVaultDirs() )
  const entries = await readdir( config.vaultsPath, { withFileTypes: true } )
  const folders = entries
    .filter( ( entry ) => entry.isDirectory() && !claimed.has( entry.name ) )
    .map( ( { name } ) => name )
    .filter( ( name ) => VaultDir.safeParse( name ).success )

  return { folders: folders.sort(), can_create: config.vaultCreateEnabled }
}

const stamp = ( now: Date ): string => {
  return now.toISOString().replace( /\.\d+Z$/, '' ).replace( /[-:]/g, '' )
}

// Moves a folder nobody owns any more to .released/, which listUnclaimedVaults never offers
// (ADR 0097). Called after the database change; a failure is logged, never thrown.
export const releaseVaultFolder = ( vaultDir: string | null, now: Date = new Date() ): void => {
  if( vaultDir === null ) {
    return
  }

  const from = join( config.vaultsPath, vaultDir )

  try {
    if( !existsSync( from ) ) {
      return
    }

    const releasedDir = join( config.vaultsPath, '.released' )

    mkdirSync( releasedDir, { recursive: true } )

    const name = `${ vaultDir }-${ stamp( now ) }`
    let target = join( releasedDir, name )

    for( let n = 2; existsSync( target ); n += 1 ) {
      target = join( releasedDir, `${ name }-${ n }` )
    }

    renameSync( from, target )
  } catch( err ) {
    logger.error( { err, vault_dir: vaultDir }, 'Could not move a released vault folder aside' )
  }
}

// A real folder directly in the vaults folder: not a file and not a symlink
const assertPlainVaultFolder = async ( vaultDir: string ): Promise< void > => {
  const notAFolder = new ValidationError( `"${ vaultDir }" is not a folder in the vaults folder` )
  const path = join( config.vaultsPath, vaultDir )

  const info = await lstat( path ).catch( () => undefined )

  if( info === undefined || !info.isDirectory() ) {
    throw notAFolder
  }

  const root = await realpath( config.vaultsPath )

  if( await realpath( path ) !== join( root, vaultDir ) ) {
    throw notAFolder
  }
}

export const claimVault = async ( userId: string, vaultDir: string ): Promise< void > => {
  requireCanChoose( userId )
  await assertPlainVaultFolder( vaultDir )

  bind( userId, vaultDir )
}

export const createVault = async ( userId: string, vaultDir: string ): Promise< void > => {
  // A folder with no sync container behind it would never reach Obsidian (ADR 0075)
  if( !config.vaultCreateEnabled ) {
    throw new ForbiddenError( 'New vaults are set up by the admin' )
  }

  // Taken before the folder is made: recreating a missing vault's own name must still bind
  const expected = requireCanChoose( userId )

  try {
    await mkdir( join( config.vaultsPath, vaultDir ) )
  } catch( error ) {
    if( error instanceof Error && 'code' in error && error.code === 'EEXIST' ) {
      throw new ConflictError( 'That vault is already taken' )
    }

    throw error
  }

  try {
    bind( userId, vaultDir, expected )
  } catch( error ) {
    // Only the empty folder just made; rmdir refuses anything that has files in it
    await rmdir( join( config.vaultsPath, vaultDir ) ).catch( () => undefined )

    throw error
  }
}
