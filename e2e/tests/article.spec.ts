import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './signedIn.js'

const vaultDir = (): string => {
  const dir = process.env.E2E_VAULT_DIR

  if( dir === undefined ) {
    throw new Error( 'E2E_VAULT_DIR is not set; run the tests with pnpm e2e' )
  }

  return dir
}

const newNotes = ( dir: string ): string[] => readdirSync( dir, { recursive: true } )
  .map( String )
  .filter( ( file ) => file.endsWith( '.md' )
    && !file.endsWith( 'Existing note.md' )
    && !file.startsWith( 'Learning/' ) )

test( 'an article is summarized, linked, reviewed and saved to the vault', async ( { page } ) => {
  await page.goto( '/transcriber' )
  await page.getByLabel( 'URL' ).fill( 'http://fakes:4000/article' )
  await page.getByRole( 'button', { name: 'Summarize' } ).click()

  // The worker fetches, summarizes and links in the background.
  const save = page.getByRole( 'button', { name: 'Save to vault' } )

  await expect( save ).toBeEnabled( { timeout: 60_000 } )

  await page.getByRole( 'tab', { name: /Suggested links/ } ).click()

  const links = page.getByRole( 'region', { name: 'Suggested links' } )

  await links.getByRole( 'button', { name: 'Accept', exact: true } ).first().click()
  await expect( links.getByText( 'Accepted' ) ).toBeVisible()

  await save.click()

  // The page goes home or shows the saved job, depending on which answer arrives first.
  // Read the content in the poll: the file can be seen before the write finishes.
  await expect.poll( () => newNotes( vaultDir() )
    .map( ( note ) => readFileSync( join( vaultDir(), note ), 'utf8' ) ) )
    .toEqual( [ expect.stringContaining( '[[' ) ] )
} )
