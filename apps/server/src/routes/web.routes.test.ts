// Node
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import express from 'express'
import request from 'supertest'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest'
// Routes
import { webRoutes } from './web.routes.js'

let webDir: string
const app = express()

beforeAll( async () => {
  webDir = await mkdtemp( join( tmpdir(), 'atlas-web-' ) )
  await mkdir( join( webDir, 'assets' ) )
  await writeFile( join( webDir, 'index.html' ), '<div id="root"></div>' )
  await writeFile( join( webDir, 'assets', 'app-abc123.js' ), 'console.log( 1 )' )
  await writeFile( join( webDir, 'manifest.webmanifest' ), '{"name":"Mnemosyne"}' )
  await writeFile( join( webDir, 'favicon.svg' ), '<svg xmlns="http://www.w3.org/2000/svg"/>' )

  app.use( webRoutes( webDir ) )
} )

afterAll( async () => {
  await rm( webDir, { recursive: true, force: true } )
} )

describe( 'webRoutes', () => {
  it( 'serves index.html at / with no-cache', async () => {
    const response = await request( app ).get( '/' )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toMatch( /text\/html/ )
    expect( response.text ).toContain( 'id="root"' )
    expect( response.headers[ 'cache-control' ] ).toBe( 'no-cache' )
  } )

  it( 'serves assets as immutable JavaScript', async () => {
    const response = await request( app ).get( '/assets/app-abc123.js' )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toMatch( /javascript/ )
    expect( response.headers[ 'cache-control' ] ).toContain( 'immutable' )
    expect( response.headers[ 'cache-control' ] ).toContain( 'max-age=31536000' )
  } )

  it( 'serves other files from the root', async () => {
    const response = await request( app ).get( '/favicon.svg' )

    expect( response.status ).toBe( 200 )
  } )

  it( 'serves the web app manifest as application/manifest+json', async () => {
    const response = await request( app ).get( '/manifest.webmanifest' )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toMatch( /^application\/manifest\+json/ )
  } )

  it.each( [ '/some/page', '/?job=7b7ad7a6-5f4a-4b6c-9c0e-3f0f2a6b1c11' ] )(
    'falls back to index.html for %s',
    async ( url ) => {
      const response = await request( app ).get( url )

      expect( response.status ).toBe( 200 )
      expect( response.text ).toContain( 'id="root"' )
      expect( response.headers[ 'cache-control' ] ).toBe( 'no-cache' )
    },
  )

  it( 'returns 404 for a missing file with an extension', async () => {
    const response = await request( app ).get( '/assets/missing.js' )

    expect( response.status ).toBe( 404 )
  } )

  it( 'does not answer non-GET requests with the page', async () => {
    const response = await request( app ).post( '/some/page' )

    expect( response.status ).toBe( 404 )
  } )
} )
