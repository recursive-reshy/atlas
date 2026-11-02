// Compose files (ADR 0077, TRD 8.1): one shared file, a local one that builds, and (from task 5.3) a
// production one that pulls. `docker compose config` needs no daemon, so these tests only render
// the files. Skipped with a message when docker isn't installed.
import { execFileSync, spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

const hasDocker = spawnSync( 'docker', [ 'compose', 'version' ], { stdio: 'ignore' } ).status === 0
const skip = hasDocker ? false : 'docker is not installed'

// Values every file needs; never the real .env (an empty env file replaces it)
const dummyEnv = {
  VAULTS_HOST_PATH: '/tmp/atlas-vaults',
  ANTHROPIC_API_KEY: 'dummy',
  OPENAI_API_KEY: 'dummy',
  AGENT_SECRET: 'd'.repeat( 32 ),
  ADMIN_EMAIL: 'admin@example.test',
  APP_ORIGINS: 'http://localhost:3100',
  GOOGLE_CLIENT_ID: 'dummy',
  GOOGLE_CLIENT_SECRET: 'dummy',
  TOKEN_ENCRYPTION_KEY: 'dummy',
}

const emptyEnvFile = join( mkdtempSync( join( tmpdir(), 'atlas-compose-' ) ), 'empty.env' )
writeFileSync( emptyEnvFile, '' )

// The shared file is not a valid project on its own (no image, no build); this overlay only adds
// placeholder images so it can be rendered and inspected.
const imageOnlyFile = join( dirname( emptyEnvFile ), 'images.yml' )
writeFileSync( imageOnlyFile, 'services:\n  app:\n    image: placeholder\n  agent:\n    image: placeholder\n' )

const render = ( files, { env = dummyEnv, envFiles = [ emptyEnvFile ] } = {} ) => {
  const args = [ 'compose', '--project-directory', root ]
  for( const file of files ) args.push( '-f', resolve( root, file ) )
  for( const file of envFiles ) args.push( '--env-file', file )
  args.push( 'config', '--format', 'json' )
  // COMPOSE_FILE must not leak in from the shell or a .env
  const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ...env }
  return JSON.parse( execFileSync( 'docker', args, { env: childEnv, encoding: 'utf8' } ) )
}

const publishedPorts = ( config ) =>
  Object.entries( config.services ).flatMap( ( [ name, service ] ) =>
    ( service.ports ?? [] ).map( ( port ) => ( { name, host_ip: port.host_ip, published: port.published } ) ) )

test( 'the shared file alone builds nothing, names no image and mounts no vaults', { skip }, () => {
  const config = render( [ 'docker-compose.yml', imageOnlyFile ] )
  for( const name of [ 'app', 'agent' ] ) {
    const service = config.services[ name ]
    assert.equal( service.build, undefined, `${ name } has build` )
    assert.equal( service.image, 'placeholder', `${ name } names an image` )
    assert.equal( service.env_file, undefined, `${ name } has env_file` )
    for( const volume of service.volumes ?? [] ) {
      assert.notEqual( volume.target, '/vaults', `${ name } mounts the vaults in the shared file` )
    }
  }
  assert.equal( config.name, 'atlas' )
} )

test( 'the local files build both images and mount the vaults', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.local.yml' ] )
  assert.equal( config.services.app.image, 'atlas-app:local' )
  assert.equal( config.services.agent.image, 'atlas-agent:local' )
  assert.ok( config.services.app.build, 'app builds' )
  assert.ok( config.services.agent.build, 'agent builds' )
  const mount = ( name ) => config.services[ name ].volumes.find( ( volume ) => volume.target === '/vaults' )
  assert.equal( mount( 'app' ).source, dummyEnv.VAULTS_HOST_PATH )
  assert.notEqual( mount( 'app' ).read_only, true )
  assert.equal( mount( 'agent' ).read_only, true )
} )

test( 'the app gets every variable it reads from the shared file', { skip }, () => {
  const config = render( [ 'docker-compose.yml', imageOnlyFile ] )
  const names = Object.keys( config.services.app.environment )
  for( const name of [
    'ADMIN_EMAIL', 'APP_ORIGINS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY',
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AGENT_SECRET', 'AGENT_URL', 'APP_TIME_ZONE',
    'VAULT_CREATE_ENABLED', 'TRANSCRIPTION_MODEL', 'LOG_LEVEL', 'STATUS_CHECK_INTERVAL_MINUTES',
  ] ) {
    assert.ok( names.includes( name ), `app environment lacks ${ name }` )
  }
} )

test( 'a missing required variable stops the shared file', { skip }, () => {
  const { ANTHROPIC_API_KEY: _removed, ...env } = dummyEnv
  assert.throws( () => render( [ 'docker-compose.yml', imageOnlyFile ], { env } ), /ANTHROPIC_API_KEY/ )
} )

test( 'only the app publishes a port, on 127.0.0.1', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.local.yml' ] )
  assert.deepEqual( publishedPorts( config ), [ { name: 'app', host_ip: '127.0.0.1', published: '3100' } ] )
} )

test( 'the e2e override layers on the shared and local files', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.local.yml', 'e2e/docker-compose.e2e.yml' ] )
  assert.equal( config.services.app.image, 'atlas-e2e:local' )
  assert.equal( config.services.app.env_file, undefined )
  assert.ok( config.services.fakes, 'fakes service exists' )
} )

test( '.env.example makes plain docker compose use the local files', () => {
  const text = readFileSync( join( root, '.env.example' ), 'utf8' )
  assert.match( text, /^COMPOSE_FILE=docker-compose\.yml:compose\.local\.yml$/m )
} )
