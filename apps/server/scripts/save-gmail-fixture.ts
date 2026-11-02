// Node
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Config
import { config } from '#src/config.js'
// Gmail
import { getGmailClient } from '#src/gmail/auth.js'
import { findOwnerName, scrubMessage } from '#src/gmail/scrubMessage.js'
import { stripFixture } from '#src/gmail/stripFixture.js'
// Repositories
import { closeDatabase, openDatabase } from '#src/repositories/database.js'
import { findAccount } from '#src/repositories/gmailAccount.repository.js'
import { listUsers } from '#src/repositories/users.repository.js'

const [ messageId, name, ownerName ] = process.argv.slice( 2 )

const validName = name !== undefined && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test( name )

if( !messageId || !validName ) {
  console.error(
    'Usage: pnpm --filter @atlas/server fixture:gmail <messageId> <name> [display name]',
  )
  console.error( 'The name may only use letters, digits, - and _.' )
  process.exit( 1 )
}

await mkdir( config.dataDir, { recursive: true } )
openDatabase( join( config.dataDir, 'atlas.db' ) )

try {
  // The fixture comes from the admin's mailbox
  const admin = listUsers().find( ( { role } ) => role === 'admin' )
  const account = admin === undefined ? undefined : findAccount( admin.id )

  if( admin === undefined || account === undefined ) {
    throw new Error( 'Gmail isn\'t connected. Connect it in Settings first.' )
  }

  const { data } = await getGmailClient( admin.id ).users.messages.get( {
    userId: 'me',
    id: messageId,
    format: 'full',
  } )
  // Scrub the owner's address and name first, then strip what could identify the subscription.
  const scrubbed = stripFixture( scrubMessage( data, {
    email: account.email,
    name: ownerName ?? findOwnerName( data, account.email ),
  } ), name )
  const folder = fileURLToPath( new URL( '../src/test-support/gmail/', import.meta.url ) )
  const file = join( folder, `${ name }.json` )

  await mkdir( folder, { recursive: true } )
  await writeFile( file, `${ JSON.stringify( scrubbed, null, 2 ) }\n` )
  console.log( `Saved ${ file }` )
} finally {
  closeDatabase()
}
