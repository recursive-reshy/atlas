// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { BackupResult } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest as request } from '../test-support/auth.js'
// Errors
import { BackupError, ConflictError } from '../errors.js'
// Services
import { runBackup } from '../services/backup.service.js'

vi.mock( '../services/backup.service.js', () => ( { runBackup: vi.fn() } ) )

const result = { file: 'mnemosyne-20261023-043000.db', bytes: 4096, at: '2026-10-22T20:30:00.000Z' }

beforeEach( () => {
  vi.mocked( runBackup ).mockReset()
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'POST /api/backups', () => {
  it( 'answers 201 with the backup result', async () => {
    vi.mocked( runBackup ).mockResolvedValue( result )

    const response = await request( app ).post( '/api/backups' )

    expect( response.status ).toBe( 201 )
    expect( BackupResult.parse( response.body ) ).toEqual( result )
  } )

  it( 'answers 409 while a backup is running', async () => {
    vi.mocked( runBackup ).mockRejectedValue( new ConflictError( 'A backup is already running' ) )

    const response = await request( app ).post( '/api/backups' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'A backup is already running' } )
  } )

  it( 'answers 500 with the message when the backup fails', async () => {
    vi.mocked( runBackup ).mockRejectedValue( new BackupError( 'Backup failed: disk full' ) )

    const response = await request( app ).post( '/api/backups' )

    expect( response.status ).toBe( 500 )
    expect( response.body ).toEqual( { error: 'Backup failed: disk full' } )
  } )
} )

describe( 'POST /api/backups for a member', () => {
  it( 'answers 404 and writes nothing', async () => {
    const response = await request( app, createTestUser() ).post( '/api/backups' )
    const unknown = await request( app, createTestUser() ).post( '/api/nope' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( unknown.body )
    expect( runBackup ).not.toHaveBeenCalled()
  } )
} )
