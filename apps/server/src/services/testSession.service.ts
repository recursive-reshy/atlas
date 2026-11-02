// Node
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import type { ModuleId } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { setModules } from '../repositories/userModules.repository.js'
import { findUserByEmail, insertUser, setVaultDir } from '../repositories/users.repository.js'
// Services
import { createSession } from './session.service.js'
import { seedUser } from './seedUser.service.js'

export type TestSignIn = {
  email: string
  modules?: ModuleId[]
  vault_dir?: string
}

// For the e2e stack only (TRD §11.4): signs in as `email`, making the user if needed. The admin is
// the user whose email is ADMIN_EMAIL; everyone else is a member with the modules given. A vault is
// bound only to a user who has none, and only if the folder exists.
export const signInForTest = async (
  { email, modules, vault_dir }: TestSignIn,
  now: Date,
): Promise< { token: string } > => {
  if( vault_dir !== undefined ) {
    const info = await lstat( join( config.vaultsPath, vault_dir ) ).catch( () => undefined )

    if( info === undefined || !info.isDirectory() ) {
      throw new ValidationError( 'That vault folder does not exist' )
    }
  }

  return inTransaction( () => {
    const normalized = email.toLowerCase()
    let user = findUserByEmail( normalized )
    const created = user === undefined

    if( user === undefined ) {
      const id = randomUUID()
      const role = normalized === config.adminEmail ? 'admin' : 'member'

      insertUser( {
        id,
        email: normalized,
        name: normalized,
        role,
        status: 'active',
        created_at: now.toISOString(),
      } )
      seedUser( id, now.toISOString() )
      user = findUserByEmail( normalized )
    }

    if( user === undefined ) {
      throw new Error( 'The test user was not saved' )
    }

    if( user.role === 'member' && ( created || modules !== undefined ) ) {
      setModules( user.id, modules ?? [] )
    }

    const needsVault = vault_dir !== undefined && user.vault_dir === null

    if( needsVault && !setVaultDir( user.id, vault_dir ).ok ) {
      throw new ConflictError( 'That vault folder is already taken' )
    }

    return createSession( user.id, now )
  } )
}
