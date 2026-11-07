// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { ListModelsResponse, ListPromptProfilesResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Services
import { clearModelCache } from '../services/models.service.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

vi.mock( '../clients/anthropicModels.client.js' )

beforeEach( () => {
  clearModelCache()
  vi.mocked( listSummaryModels ).mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
  ] )
} )

type Modules = ( 'transcriber' | 'melete' )[]

const unknown = (): string => crypto.randomUUID()

// One representative request for every module-gated router
const TRANSCRIBER_ROUTES = [
  '/api/jobs',
  `/api/jobs/${ unknown() }`,
  `/api/jobs/${ unknown() }/link-suggestions`,
  '/api/feeds',
  '/api/inbox',
  '/api/gmail/account',
  '/api/gmail/sources',
  '/api/vault/folders',
]

const MELETE_ROUTES = [
  '/api/melete/today',
  `/api/melete/subjects/${ unknown() }`,
  `/api/melete/notes/${ unknown() }`,
  '/api/melete/review/next',
]

const SHARED_ROUTES = [
  '/api/me',
  '/api/settings',
  '/api/models',
  '/api/prompt-profiles',
  '/api/status',
]

const statusOf = async (
  user: ReturnType< typeof createTestUser >,
  path: string,
): Promise< number > => {
  return ( await signedInRequest( app, user ).get( path ) ).status
}

describe( 'the Transcriber routes', () => {
  it.each( TRANSCRIBER_ROUTES )( '%s is a 404 without the Transcriber module', async ( path ) => {
    const melete = createTestUser( { modules: [ 'melete' ] } )
    const nothing = createTestUser( { modules: [] } )
    const unknownRoute = await signedInRequest( app, melete ).get( '/api/nowhere' )
    const gated = await signedInRequest( app, melete ).get( path )

    expect( gated.status ).toBe( 404 )
    expect( gated.body ).toEqual( unknownRoute.body )
    expect( await statusOf( nothing, path ) ).toBe( 404 )
  } )

  it.each( TRANSCRIBER_ROUTES )( '%s is open with the module, and to the admin', async ( path ) => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } )
    const admin = createTestUser( { role: 'admin' } )

    expect( [ 200, 404, 409 ] ).toContain( await statusOf( transcriber, path ) )
    expect( ( await signedInRequest( app, transcriber ).get( '/api/nowhere' ) ).status ).toBe( 404 )
    expect( await statusOf( admin, '/api/feeds' ) ).toBe( 200 )
  } )

  it( 'refuses a write the same way, and saves nothing', async () => {
    const melete = createTestUser( { modules: [ 'melete' ] } )

    const created = await signedInRequest( app, melete )
      .post( '/api/jobs' )
      .send( { url: 'https://www.youtube.com/watch?v=abc' } )
    const listed = await signedInRequest( app, createTestUser( { role: 'admin' } ) )
      .get( '/api/jobs' )

    expect( created.status ).toBe( 404 )
    expect( ( listed.body as { jobs: unknown[] } ).jobs ).toEqual( [] )
  } )
} )

describe( 'the Melete routes', () => {
  it.each( MELETE_ROUTES )( '%s is a 404 without the Melete module', async ( path ) => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } )

    expect( await statusOf( transcriber, path ) ).toBe( 404 )
    expect( await statusOf( createTestUser( { modules: [] } ), path ) ).toBe( 404 )
  } )

  it( 'opens to a user with the module and to the admin', async () => {
    expect( await statusOf( createTestUser( { modules: [ 'melete' ] } ), '/api/melete/today' ) )
      .toBe( 200 )
    expect( await statusOf( createTestUser( { role: 'admin' } ), '/api/melete/today' ) ).toBe( 200 )
  } )
} )

describe( 'the shared routes', () => {
  it.each( SHARED_ROUTES )( '%s answers every user, whatever their modules', async ( path ) => {
    const sets: Modules[] = [ [], [ 'transcriber' ], [ 'melete' ] ]

    for( const modules of sets ) {
      const status = await statusOf( createTestUser( { modules } ), path )

      expect( status, `${ path } with ${ modules.join( '+' ) }` ).toBe( 200 )
    }
  } )

  it( 'lists the prompt profiles of the user\'s modules only', async () => {
    const list = async ( modules: ( 'transcriber' | 'melete' )[] ): Promise< string[] > => {
      const response = await signedInRequest( app, createTestUser( { modules } ) )
        .get( '/api/prompt-profiles?purpose=all' )

      return ListPromptProfilesResponse.parse( response.body ).profiles
        .map( ( { purpose } ) => purpose )
    }

    expect( new Set( await list( [ 'transcriber' ] ) ) )
      .toEqual( new Set( [ 'summary', 'linker' ] ) )
    expect( new Set( await list( [ 'melete' ] ) ) )
      .toEqual( new Set( [
        'melete_questions',
        'melete_grading',
        'melete_syllabus',
        'melete_map',
        'melete_suggest',
      ] ) )
    expect( new Set( await list( [ 'transcriber', 'melete' ] ) ).size ).toBe( 7 )
    expect( await list( [] ) ).toEqual( [] )
  } )

  it( 'answers 404 for a profile of a module the user does not have', async () => {
    const both = createTestUser()
    const melete = createTestUser( { modules: [ 'melete' ] } )
    const profiles = ListPromptProfilesResponse.parse(
      ( await signedInRequest( app, both ).get( '/api/prompt-profiles?purpose=all' ) ).body,
    ).profiles
    const summary = profiles.find( ( { purpose } ) => purpose === 'summary' )?.id ?? ''

    const asMelete = signedInRequest( app, melete )

    expect( ( await asMelete.get( '/api/prompt-profiles' ) ).status ).toBe( 200 )
    expect( await statusOf( melete, `/api/prompt-profiles/${ summary }/versions` ) ).toBe( 404 )
    expect( ( await signedInRequest( app, melete )
      .post( '/api/prompt-profiles' )
      .send( { name: 'Mine', guidance: 'x' } ) ).status ).toBe( 404 )
  } )

  it( 'lists the models for everyone', async () => {
    const response = await signedInRequest( app, createTestUser( { modules: [] } ) )
      .get( '/api/models' )

    expect( ListModelsResponse.safeParse( response.body ).success ).toBe( true )
  } )
} )

describe( 'settings by module', () => {
  it( 'refuses a key of a module the user lacks, saving nothing of the request', async () => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } )
    const melete = createTestUser( { modules: [ 'melete' ] } )

    const meleteKey = await signedInRequest( app, transcriber )
      .patch( '/api/settings' )
      .send( { melete_review_mode: 'quick', linking_enabled: false } )
    const transcriberKey = await signedInRequest( app, melete )
      .patch( '/api/settings' )
      .send( { linking_enabled: false } )

    expect( meleteKey.status ).toBe( 404 )
    expect( transcriberKey.status ).toBe( 404 )

    const after = await signedInRequest( app, transcriber ).get( '/api/settings' )
    const { settings } = after.body as {
      settings: { linking_enabled: boolean, melete_review_mode: string }
    }

    expect( settings.linking_enabled ).toBe( true )
    expect( settings.melete_review_mode ).toBe( 'typed' )
  } )

  it( 'accepts the keys of the user\'s own module', async () => {
    const melete = createTestUser( { modules: [ 'melete' ] } )
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } )

    expect( ( await signedInRequest( app, melete )
      .patch( '/api/settings' )
      .send( { melete_review_mode: 'quick' } ) ).status ).toBe( 200 )
    expect( ( await signedInRequest( app, transcriber )
      .patch( '/api/settings' )
      .send( { linking_enabled: false } ) ).status ).toBe( 200 )
  } )
} )
