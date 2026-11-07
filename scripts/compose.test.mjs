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
  GEMINI_MODEL: 'gemini-test',
  GEMINI_API_KEY: 'dummy',
  YOUTUBE_API_KEY: 'dummy',
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
    'GEMINI_MODEL', 'GEMINI_API_KEY', 'YOUTUBE_API_KEY',
    'ANTHROPIC_API_KEY', 'AGENT_SECRET', 'AGENT_URL', 'APP_TIME_ZONE',
    'VAULT_CREATE_ENABLED', 'LOG_LEVEL', 'STATUS_CHECK_INTERVAL_MINUTES',
  ] ) {
    assert.ok( names.includes( name ), `app environment lacks ${ name }` )
  }
  for( const name of [
    'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'TRANSCRIPTION_MODEL', 'POT_PROVIDER_URL',
    'GOOGLE_CLOUD_PROJECT', 'GEMINI_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS',
  ] ) {
    assert.ok( !names.includes( name ), `app environment still has ${ name } (ADR 0081)` )
  }
  assert.equal( config.services.app.environment.GEMINI_MODEL, dummyEnv.GEMINI_MODEL )
  assert.equal( config.services.app.environment.GEMINI_API_KEY, dummyEnv.GEMINI_API_KEY )
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

// --- production file (task 5.3) ---

// What deploy/vm/atlas.env.example and the fetched secrets provide on the VM
const prodEnv = {
  ...dummyEnv,
  REGISTRY: 'registry.example/atlas/atlas',
  ATLAS_VERSION: '0.10.0',
  VAULTS_HOST_PATH: '/srv/atlas/vaults',
  LITESTREAM_BUCKET: 'example-bucket',
}

test( 'production pulls images, builds nothing and publishes only the app', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.prod.yml' ], { env: prodEnv } )
  for( const [ name, service ] of Object.entries( config.services ) ) {
    assert.equal( service.build, undefined, `${ name } builds` )
  }
  assert.equal( config.services.app.image, 'registry.example/atlas/atlas/app:0.10.0' )
  assert.equal( config.services.agent.image, 'registry.example/atlas/atlas/agent:0.10.0' )
  assert.equal( config.services[ 'sync-naresh' ].image, 'registry.example/atlas/atlas/sync:0.10.0' )
  assert.deepEqual( publishedPorts( config ), [ { name: 'app', host_ip: '127.0.0.1', published: '3100' } ] )
} )

test( 'production restores the database before the app and replicates after it', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.prod.yml' ], { env: prodEnv } )
  const { app, restore, litestream } = config.services
  assert.equal( app.depends_on.restore.condition, 'service_completed_successfully' )
  assert.equal( litestream.depends_on.app.condition, 'service_started' )
  for( const service of [ restore, litestream ] ) {
    assert.equal( service.user, '1000:1000' )
    assert.match( service.image, /^litestream\/litestream:0\.5\.17@sha256:[0-9a-f]{64}$/ )
    assert.ok( service.volumes.some( ( volume ) => volume.target === '/data' ), 'shares /data' )
    assert.ok( service.volumes.some( ( volume ) => volume.target === '/etc/litestream.yml' && volume.read_only ), 'config is read only' )
    assert.equal( service.environment.LITESTREAM_BUCKET, 'example-bucket' )
  }
  assert.deepEqual( restore.command.slice( 0, 3 ), [ 'restore', '-if-db-not-exists', '-if-replica-exists' ] )
  assert.ok( restore.command.includes( '/data/atlas.db' ) )
  assert.equal( restore.restart, 'no' )
  assert.deepEqual( litestream.command, [ 'replicate' ] )
  assert.equal( litestream.restart, 'unless-stopped' )
  assert.equal( app.environment.LITESTREAM_METRICS_URL, 'http://litestream:9090/metrics' )
} )

test( 'production syncs the vault with a container that shares only that vault and the status folder', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.prod.yml' ], { env: prodEnv } )
  const sync = config.services[ 'sync-naresh' ]
  assert.equal( sync.user, undefined, 'the image already runs as node (UID 1000)' )
  assert.equal( sync.environment.VAULT_DIR, 'naresh' )
  const targets = Object.fromEntries( sync.volumes.map( ( volume ) => [ volume.target, volume ] ) )
  assert.equal( targets[ '/vault' ].source, '/srv/atlas/vaults/naresh' )
  assert.ok( targets[ '/status' ], 'writes the status folder' )
  assert.ok( targets[ '/home/node/.config/obsidian-headless' ], 'keeps its login in its own volume' )
  assert.equal( Object.keys( targets ).length, 3 )

  const app = config.services.app
  assert.equal( app.environment.VAULT_SYNC_STATUS_DIR, '/sync-status' )
  const status = app.volumes.find( ( volume ) => volume.target === '/sync-status' )
  assert.equal( status.read_only, true )
  assert.equal( status.source, targets[ '/status' ].source )

  const vaults = ( name ) => config.services[ name ].volumes.find( ( volume ) => volume.target === '/vaults' )
  assert.equal( vaults( 'app' ).source, '/srv/atlas/vaults' )
  assert.equal( vaults( 'agent' ).read_only, true )
} )

test( 'production keeps the database and status folders on the host with the app user as owner', { skip }, () => {
  // A fresh named volume is root-owned when the Litestream image mounts it first, and the
  // services running as UID 1000 could not write to it.
  const config = render( [ 'docker-compose.yml', 'compose.prod.yml' ], { env: prodEnv } )
  assert.equal( config.volumes.data.driver_opts.device, '/srv/atlas/data' )
  assert.equal( config.volumes[ 'sync-status' ].driver_opts.device, '/srv/atlas/sync-status' )
} )

test( 'production has no PO token provider and no Google credentials for Gemini', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.prod.yml' ], { env: prodEnv } )
  assert.equal( config.services[ 'pot-provider' ], undefined )
  assert.equal( config.services.app.environment.POT_PROVIDER_URL, undefined )
  // Gemini uses an API key (ADR 0083): no credentials file, no mount
  assert.equal( config.services.app.environment.GOOGLE_APPLICATION_CREDENTIALS, undefined )
  assert.ok( !config.services.app.volumes.some( ( volume ) => volume.target === '/gcp/adc.json' ) )
  assert.deepEqual( publishedPorts( config ), [ { name: 'app', host_ip: '127.0.0.1', published: '3100' } ] )
} )

test( 'locally nothing from the Mac\'s Google login is mounted any more', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.local.yml' ] )
  assert.ok( !config.services.app.volumes.some( ( volume ) => volume.target === '/gcp/adc.json' ) )
  assert.equal( config.services.app.environment.GOOGLE_APPLICATION_CREDENTIALS, undefined )
  assert.equal( config.services[ 'pot-provider' ], undefined )
  assert.equal( config.services.app.environment.GEMINI_API_KEY, dummyEnv.GEMINI_API_KEY )
} )

test( 'e2e talks to the fakes for Gemini and YouTube', { skip }, () => {
  const config = render( [ 'docker-compose.yml', 'compose.local.yml', 'e2e/docker-compose.e2e.yml' ] )
  const environment = config.services.app.environment
  assert.equal( environment.GEMINI_BASE_URL, 'http://fakes:4000' )
  assert.equal( environment.YOUTUBE_API_BASE_URL, 'http://fakes:4000' )
  assert.equal( environment.GEMINI_MODEL, 'gemini-e2e' )
  assert.ok( environment.GEMINI_API_KEY, 'a dummy key is set' )
  for( const name of [ 'GEMINI_ACCESS_TOKEN', 'GOOGLE_CLOUD_PROJECT', 'OPENAI_BASE_URL', 'OPENAI_API_KEY' ] ) {
    assert.ok( !( name in environment ), `e2e still sets ${ name }` )
  }
  assert.ok( config.services.app.volumes.some( ( volume ) => volume.target === '/vaults' ), 'still has the vaults' )
  assert.ok( config.services.app.volumes.some( ( volume ) => volume.target === '/data' ), 'still has the data volume' )
} )

test( 'atlas.env.example names the Gemini model and no Vertex settings', () => {
  const text = readFileSync( join( root, 'deploy/vm/atlas.env.example' ), 'utf8' )
  assert.match( text, /^GEMINI_MODEL=/m )
  assert.doesNotMatch( text, /GOOGLE_CLOUD_PROJECT|GEMINI_LOCATION|TRANSCRIPTION_MODEL|OPENAI/ )
} )
