// Every third-party base image and Compose image is pinned as tag@sha256:<digest> (ADR 0087), so a
// rebuild can't change it silently. Our own images (atlas-*:local, ${REGISTRY}/…) are exempt, and so
// are build-stage names (`FROM build`). Reads the tracked files as text; no Docker, no network.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

const PINNED = /^[^\s@]+:[^\s@]+@sha256:[0-9a-f]{64}$/

// The image names a file references, with the line they are on
const imageReferences = ( name, text ) => {
  const isDockerfile = basename( name ).startsWith( 'Dockerfile' )
  const stages = new Set()
  const found = []

  text.split( '\n' ).forEach( ( raw, index ) => {
    const line = raw.trim()

    if( line.startsWith( '#' ) ) {
      return
    }

    if( isDockerfile ) {
      const from = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec( line )

      if( from ) {
        if( !stages.has( from[ 1 ] ) ) {
          found.push( { image: from[ 1 ], line: index + 1 } )
        }

        if( from[ 2 ] ) {
          stages.add( from[ 2 ] )
        }
      }

      return
    }

    const image = /^image:\s*["']?([^"'\s]+)["']?/.exec( line )

    if( image ) {
      found.push( { image: image[ 1 ], line: index + 1 } )
    }
  } )

  return found
}

const isOurs = ( image ) => image.startsWith( 'atlas-' ) || image.includes( '${REGISTRY' )

const unpinned = ( name, text ) => imageReferences( name, text )
  .filter( ( { image } ) => !isOurs( image ) && !PINNED.test( image ) )
  .map( ( { image, line } ) => `${ name }:${ line } ${ image }` )

const digest = 'a'.repeat( 64 )

test( 'the checker accepts a pinned image and refuses a tag alone', () => {
  assert.deepEqual( unpinned( 'Dockerfile', `FROM node:24-slim@sha256:${ digest } AS build\n` ), [] )
  assert.deepEqual( unpinned( 'Dockerfile', 'FROM node:24-slim AS build\n' ), [ 'Dockerfile:1 node:24-slim' ] )
  assert.deepEqual( unpinned( 'Dockerfile', 'FROM node:24-slim@sha256:abc\n' ), [ 'Dockerfile:1 node:24-slim@sha256:abc' ] )
  assert.deepEqual( unpinned( 'compose.yml', '    image: litestream/litestream:0.5.17\n' ), [ 'compose.yml:1 litestream/litestream:0.5.17' ] )
  assert.deepEqual( unpinned( 'compose.yml', `    image: litestream/litestream:0.5.17@sha256:${ digest }\n` ), [] )
  assert.deepEqual( unpinned( 'compose.yml', '    image: node\n' ), [ 'compose.yml:1 node' ] )
} )

test( 'the checker skips our own images, stage names and comments', () => {
  assert.deepEqual( unpinned( 'compose.yml', '    image: atlas-app:local\n    image: ${REGISTRY}/app:${ATLAS_VERSION}\n' ), [] )
  assert.deepEqual( unpinned( 'Dockerfile', `FROM node:24-slim@sha256:${ digest } AS build\nFROM build\n` ), [] )
  assert.deepEqual( unpinned( 'Dockerfile', '# FROM node:24-slim\n' ), [] )
  assert.deepEqual( unpinned( 'compose.yml', '    # image: node:24\n' ), [] )
} )

test( 'the checker handles --platform and a bare FROM with no alias', () => {
  assert.deepEqual( unpinned( 'Dockerfile', 'FROM --platform=linux/amd64 python:3.14-slim\n' ), [ 'Dockerfile:1 python:3.14-slim' ] )
} )

const tracked = execFileSync( 'git', [ 'ls-files' ], { cwd: root, encoding: 'utf8' } )
  .split( '\n' )
  .filter( ( file ) => /(^|\/)Dockerfile[^/]*$/.test( file ) || /(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test( file ) )

test( 'the repo has Dockerfiles and Compose files to check', () => {
  assert.ok( tracked.length >= 8, `found only ${ tracked.join( ', ' ) }` )
} )

test( 'no third-party image is referenced by tag alone', () => {
  const problems = tracked.flatMap( ( file ) => unpinned( file, readFileSync( join( root, file ), 'utf8' ) ) )

  assert.deepEqual( problems, [], `Pin each as tag@sha256:<digest> (docs/deploy.md, "Updating a pinned image"):\n${ problems.join( '\n' ) }` )
} )
