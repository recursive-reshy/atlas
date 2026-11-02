// Node
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
// Express
import type { Express } from 'express'
// Packages
import supertest from 'supertest'
// Shared
import { ModuleId } from '@atlas/shared'
import type { Role } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Middleware
import { SESSION_COOKIE } from '../services/session.service.js'
// Repositories
import { setModules } from '../repositories/userModules.repository.js'
import { findUserById, insertUser, setVaultDir } from '../repositories/users.repository.js'
// Services
import { createSession } from '../services/session.service.js'
import { seedUser } from '../services/seedUser.service.js'

export type TestUser = {
  id: string
  email: string
  role: Role
  token: string
}

export type TestUserOptions = {
  role?: Role
  modules?: ModuleId[]
  vault_dir?: string | null
  email?: string
}

// Inserts a user (and a session for them) in the current test database
export const createTestUser = ( options: TestUserOptions = {} ): TestUser => {
  const id = randomUUID()
  const email = options.email ?? `${ id }@example.com`
  const role = options.role ?? 'member'
  const now = new Date()

  insertUser( {
    id,
    email,
    name: `Test ${ role }`,
    role,
    status: 'active',
    created_at: now.toISOString(),
  } )
  setModules( id, role === 'admin' ? [] : options.modules ?? [ ...ModuleId.options ] )

  if( options.vault_dir !== undefined && options.vault_dir !== null ) {
    setVaultDir( id, options.vault_dir )
  }

  seedUser( id, now.toISOString() )

  return { id, email, role, token: createSession( id, now ).token }
}

export const cookieFor = ( user: TestUser ): string => `${ SESSION_COOKIE }=${ user.token }`

// Where the default admin's vault is, under `config.vaultsPath`
export const DEFAULT_TEST_VAULT = 'vault'

// Resolved when called, because tests move `config.vaultsPath`
export const defaultTestVaultPath = (): string => join( config.vaultsPath, DEFAULT_TEST_VAULT )

let cached: TestUser | undefined

// The admin every signed-in route test acts as, with a vault folder on disk; made on first use,
// as each test has a new database
export const defaultTestAdmin = (): TestUser => {
  // A vault must exist to be used (ADR 0070); tests that remove it do so on purpose. A test that
  // mocks the config has no vaults folder and doesn't use the vault.
  try {
    mkdirSync( defaultTestVaultPath(), { recursive: true } )
  } catch( error ) {
    if( !( error instanceof TypeError ) ) {
      throw error
    }
  }

  if( cached === undefined || findUserById( cached.id ) === undefined ) {
    cached = createTestUser( {
      role: 'admin',
      email: 'test-admin@example.com',
      vault_dir: DEFAULT_TEST_VAULT,
    } )
  }

  return cached
}

type Agent = ReturnType< typeof supertest.agent >

// Sends the user's session cookie, and application/json so bodyless POSTs pass `jsonOnly`
export const signedIn = ( agent: Agent, user: TestUser ): Agent => {
  return agent.set( 'Cookie', cookieFor( user ) ).set( 'Content-Type', 'application/json' )
}

// A drop-in for supertest's `request( app )` that is signed in (as the default admin unless given)
export const signedInRequest = ( app: Express, user: TestUser = defaultTestAdmin() ): Agent => {
  return signedIn( supertest.agent( app ), user )
}
