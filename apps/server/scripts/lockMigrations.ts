// Repositories
import { migrations } from '#src/repositories/database.js'
import { LOCK_PATH, lockMigrations } from '#src/repositories/migrationLock.js'

const check = process.argv.includes( '--check' )
const versions = lockMigrations( LOCK_PATH, migrations, { check } )

if( check && versions.length > 0 ) {
  console.error(
    `Migrations ${ versions.join( ', ' ) } are not locked. `
    + 'Run `pnpm --filter @atlas/server migrations:lock` and commit migrations.lock.json.',
  )
  process.exit( 1 )
}

console.log( versions.length > 0 && !check
  ? `Locked migrations ${ versions.join( ', ' ) }.`
  : 'All migrations are locked.' )
