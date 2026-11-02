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
import { GetMeleteTodayResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Config
import { config } from '../config.js'
// Melete
import { resetScanClock } from '../melete/scanClock.js'
// Repositories
import { listNotesUnder } from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

vi.mock( '../clients/claude.client.js' )

type Agent = ReturnType< typeof signedInRequest >

let vault: MeleteVault
let originalVaultsPath: string
let owner: TestUser
let other: TestUser

const unknown = (): string => crypto.randomUUID()

beforeEach( async () => {
  vault = await createMeleteVault()
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = vault.vaultsPath
  await vault.clone( 'other' )
  owner = createTestUser( { role: 'admin', vault_dir: vault.vaultDir } )
  other = createTestUser( { vault_dir: 'other' } )
  setSetting( owner.id, 'melete_learning_root', 'Learning' )
  setSetting( other.id, 'melete_learning_root', 'Learning' )
  resetScanClock()
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await vault.cleanup()
} )

// The owner's scanned subject, note and an enrolled question to ask about
const ownersData = async (): Promise< { subject: string, note: string, question: string } > => {
  await signedInRequest( app, owner ).get( '/api/melete/today' )

  const subject = listSubjects( owner.id )[ 0 ]
  const note = listNotesUnder( owner.id, 'Learning' )[ 0 ]

  if( subject === undefined || note === undefined ) {
    throw new Error( 'The vault fixture was not scanned' )
  }

  return {
    subject: subject.id,
    note: note.id,
    question: addQuestion(
      owner.id,
      note.id,
      { fsrsState: 'review', due: '2026-10-01T00:00:00.000Z' },
    ),
  }
}

describe( 'the Melete routes are per user', () => {
  it( 'answers every route on another user\'s data like an unknown id', async () => {
    const { subject, note, question } = await ownersData()
    const asOther = (): Agent => signedInRequest( app, other )

    type Call = [ string, string, object? ]
    const calls = ( s: string, n: string, q: string ): Call[] => [
      [ 'get', `/api/melete/subjects/${ s }` ],
      [ 'patch', `/api/melete/subjects/${ s }`, { new_per_day: 1 } ],
      [ 'post', `/api/melete/subjects/${ s }/enrollment`, { enrolled: true } ],
      [ 'get', `/api/melete/notes/${ n }` ],
      [ 'patch', `/api/melete/notes/${ n }`, { enrolled: true } ],
      [ 'post', `/api/melete/notes/${ n }/regenerate`, {} ],
      [ 'post', `/api/melete/notes/${ n }/retry`, {} ],
      [ 'post', `/api/melete/questions/${ q }/drop`, {} ],
      [ 'get', `/api/melete/review/next?subject=${ s }` ],
      [ 'post', `/api/melete/questions/${ q }/grade`, { answer: 'mine' } ],
      [ 'post', `/api/melete/questions/${ q }/review`, { rating: 'good', mode: 'quick' } ],
    ]

    type Reply = { status: number, body: unknown }

    const send = async ( [ method, path, body ]: Call ): Promise< Reply > => {
      const agent = asOther()
      const request = method === 'get'
        ? agent.get( path )
        : agent[ method as 'post' ]( path )
      const response = await ( body === undefined ? request : request.send( body ) )

      return { status: response.status, body: response.body as unknown }
    }

    const refused = await Promise.all( calls( subject, note, question ).map( send ) )
    const missing = await Promise.all( calls( unknown(), unknown(), unknown() ).map( send ) )

    expect( refused.map( ( { status } ) => status ) )
      .toEqual( missing.map( ( { status } ) => status ) )
    expect( refused.map( ( { status } ) => status ) ).toEqual( Array( 11 ).fill( 404 ) )
    expect( refused.map( ( { body } ) => body ) ).toEqual( missing.map( ( { body } ) => body ) )
    expect( findQuestion( owner.id, question )?.state ).toBe( 'active' )
  } )

  it( 'gives each user their own subjects and notes from the same vault', async () => {
    const { subject } = await ownersData()

    const mine = GetMeleteTodayResponse.parse(
      ( await signedInRequest( app, owner ).get( '/api/melete/today' ) ).body,
    )
    const theirs = GetMeleteTodayResponse.parse(
      ( await signedInRequest( app, other ).get( '/api/melete/today' ) ).body,
    )

    expect( theirs.subjects.map( ( { name } ) => name ) )
      .toEqual( mine.subjects.map( ( { name } ) => name ) )
    expect( theirs.subjects.map( ( { id } ) => id ) ).not.toContain( subject )
    expect( listSubjects( other.id ) ).toHaveLength( mine.subjects.length )
  } )

  it( 'lets a user\'s enrolment change only their own notes', async () => {
    const { subject } = await ownersData()

    await signedInRequest( app, other ).get( '/api/melete/today' )

    const theirSubject = listSubjects( other.id )[ 0 ]?.id ?? ''
    const response = await signedInRequest( app, other )
      .post( `/api/melete/subjects/${ theirSubject }/enrollment` )
      .send( { enrolled: true } )

    expect( response.status ).toBe( 200 )
    expect( listNotesUnder( other.id, 'Learning' ).some( ( { enrolled } ) => enrolled ) )
      .toBe( true )
    expect( listNotesUnder( owner.id, 'Learning' ).some( ( { enrolled } ) => enrolled ) )
      .toBe( false )
    expect( listSubjects( owner.id ).map( ( { id } ) => id ) ).toContain( subject )
  } )

  it( 'keeps one user\'s review mode and learning root from changing another\'s', async () => {
    setSetting( other.id, 'melete_learning_root', null )

    const response = await signedInRequest( app, other ).get( '/api/melete/today' )

    expect( GetMeleteTodayResponse.parse( response.body ).learning_root ).toBeNull()
    expect(
      GetMeleteTodayResponse.parse(
        ( await signedInRequest( app, owner ).get( '/api/melete/today' ) ).body,
      ).learning_root,
    ).toBe( 'Learning' )
  } )
} )
