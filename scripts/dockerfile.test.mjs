// The app image after ADR 0081: Gemini reads YouTube links, so the image holds no download or
// audio tools. Reads the Dockerfile as text; no Docker needed.
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const dockerfile = readFileSync( join( root, 'Dockerfile' ), 'utf8' )
const code = dockerfile.split( '\n' ).filter( ( line ) => !line.trim().startsWith( '#' ) ).join( '\n' )

test( 'the app image has no yt-dlp, bgutil plugin, ffmpeg or curl', () => {
  for( const word of [ 'yt-dlp', 'bgutil', 'BGUTIL', 'ffmpeg', 'curl', 'TARGETARCH' ] ) {
    assert.ok( !code.includes( word ), `the Dockerfile still mentions ${ word }` )
  }
})

test( 'the app image starts node directly, with no entrypoint script', () => {
  assert.equal( existsSync( join( root, 'ops/docker-entrypoint.sh' ) ), false )
  assert.ok( !code.includes( 'docker-entrypoint' ) )
  assert.ok( !/^ENTRYPOINT/m.test( code ) )
  assert.match( code, /^CMD \[ "node", "dist\/src\/server\.js" \]$/m )
})

test( 'the app image has one runtime stage after the build', () => {
  const stages = [ ...code.matchAll( /^FROM .* AS (\w+)$/gm ) ].map( ( match ) => match[ 1 ] )
  assert.deepEqual( stages, [ 'build' ] )
  assert.match( code, /^FROM node:24-slim@sha256:[0-9a-f]{64}$/m )
})

test( 'VAULT_PATH, removed from the server long ago, is not set in the image', () => {
  assert.ok( !code.includes( 'VAULT_PATH' ), 'VAULT_PATH was removed from the server long ago' )
})
