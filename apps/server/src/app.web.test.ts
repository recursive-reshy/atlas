// Node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import request from 'supertest'
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
} from 'vitest'

// Test support
import { signedInRequest } from './test-support/auth.js'

const state = vi.hoisted( () => ( { webDir: '' } ) )

vi.mock( './config.js', () => ( {
  config: {
    port: 3100,
    workDir: '/work',
    logLevel: 'silent',
    transcriptionModel: 'test-model',
    sessionDays: 30,
    get webDir(): string {
      return state.webDir
    },
  },
} ) )

let webDir: string
let app: typeof import( './app.js' )[ 'app' ]

beforeAll( async () => {
  webDir = await mkdtemp( join( tmpdir(), 'atlas-appweb-' ) )
  await writeFile( join( webDir, 'index.html' ), '<div id="root"></div>' )
  state.webDir = webDir

  ;( { app } = await import( './app.js' ) )
} )

afterAll( async () => {
  await rm( webDir, { recursive: true, force: true } )
} )

describe( 'app with WEB_DIR set', () => {
  it( 'keeps the API responding with JSON', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( response.body ).toEqual( { status: 'ok' } )
  } )

  it( 'keeps the JSON 404 for unknown API paths', async () => {
    const response = await signedInRequest( app ).get( '/api/nope' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )

  it( 'serves the web app at /', async () => {
    const response = await request( app ).get( '/' )

    expect( response.status ).toBe( 200 )
    expect( response.text ).toContain( 'id="root"' )
  } )
} )
