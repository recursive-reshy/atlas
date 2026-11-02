import { readdirSync } from 'node:fs'
import { expect, test } from './signedIn.js'

test( 'nothing is failing, and Back up now writes a database file', async ( { page } ) => {
  const backupDir = process.env.E2E_BACKUP_DIR

  if( backupDir === undefined ) {
    throw new Error( 'E2E_BACKUP_DIR is not set; run the tests with pnpm e2e' )
  }

  await page.goto( '/settings/sources' )

  const status = page.getByRole( 'heading', { name: 'Status' } ).locator( '..' )

  await expect( status.getByText( 'Loading status…' ) ).toBeHidden()
  await expect( status.getByRole( 'row', { name: /transcription/i } ) ).toContainText( 'OK' )
  await expect( status.getByText( 'Failing' ) ).toHaveCount( 0 )
  await expect( page.getByRole( 'link', { name: 'Settings', exact: true } ) ).toBeVisible()

  await status.getByRole( 'button', { name: 'Back up now' } ).click()
  await expect( status.getByRole( 'status' ) ).toContainText( 'Backed up to' )

  expect( readdirSync( backupDir ).filter( ( file ) => file.endsWith( '.db' ) ) ).toHaveLength( 1 )
} )
