// Packages
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
// App
import { app } from './app.js'
// Clients
import { assertVaultWritable } from './clients/vault.client.js'
// Config
import { config, ignoredEnv } from './config.js'
// Logging
import { logger } from './logger.js'
// Repositories
import { closeDatabase, openDatabase } from './repositories/database.js'
// Services
import { pruneHealth } from './services/health.service.js'
import { recoverInterruptedJobs } from './services/jobs.service.js'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'
// Worker
import { startIntakePoller } from './worker/intakePoller.js'
import { startMeleteGenerator } from './worker/meleteGenerator.js'
import { startServiceMonitor } from './worker/serviceMonitor.js'
import { startSweeper } from './worker/sweeper.js'
import { startWorker } from './worker/worker.js'

for( const name of ignoredEnv( process.env ) ) {
  logger.warn( { variable: name }, 'Ignored a variable that is no longer used' )
}

try {
  await assertVaultWritable( config.vaultsPath )
} catch( error ) {
  logger.error( { err: error }, 'The vaults folder is not ready' )
  process.exit( 1 )
}

await mkdir( config.dataDir, { recursive: true } )

try {
  const { setAside, preMigrationBackup } = openDatabase( join( config.dataDir, 'atlas.db' ) )

  if( setAside !== null ) {
    logger.warn( { copy: setAside }, 'Set aside a database from before 0.9 and started empty' )
  }

  if( preMigrationBackup !== null ) {
    logger.info( { copy: preMigrationBackup }, 'Backed up the database before migrating' )
  }

} catch( error ) {
  logger.error( { err: error }, 'The database cannot be opened' )
  process.exit( 1 )
}

pruneHealth()

const interrupted = recoverInterruptedJobs()

if( interrupted > 0 ) {
  logger.info( { interrupted }, 'Marked interrupted jobs as failed' )
}

const stopSweeper = startSweeper()
const stopWorker = startWorker()
const stopMeleteGenerator = startMeleteGenerator()
const stopIntakePoller = startIntakePoller()
const stopServiceMonitor = startServiceMonitor()

const server = app.listen( config.port, () => {
  logger.info( { port: config.port }, 'Server listening' )
} )

const closeServer = (): Promise< void > => new Promise( ( resolve, reject ) => {
  server.close( ( error ) => error ? reject( error ) : resolve() )
  server.closeIdleConnections()
} )

const shutdown = createShutdown( {
  stopWorker,
  stopMeleteGenerator,
  closeServer,
  closeStore: closeDatabase,
  stopSweeper,
  stopIntakePoller,
  stopServiceMonitor,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
  exit: ( code ) => process.exit( code ),
  log: ( message ) => logger.info( message ),
} )

process.on( 'SIGTERM', () => void shutdown( 'SIGTERM' ) )
process.on( 'SIGINT', () => void shutdown( 'SIGINT' ) )
