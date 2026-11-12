import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, signIn, test } from './signedIn.js'

const vaultsDir = (): string => {
  const adminVault = process.env.E2E_VAULT_DIR

  if( adminVault === undefined ) {
    throw new Error( 'E2E_VAULT_DIR is not set; run the tests with pnpm e2e' )
  }

  return dirname( adminVault )
}

test( 'a member whose vault folder disappears can create a vault again (ADR 0070)', async ( {
  baseURL,
  browser,
} ) => {
  const context = await browser.newContext( { baseURL } )
  const page = await context.newPage()

  await signIn( context, { email: 'lost@e2e.test', modules: [ 'melete' ] } )
  await page.goto( '/transcriber' )
  await page.getByLabel( 'New vault name' ).fill( 'lost-vault' )
  await page.getByRole( 'button', { name: 'Create vault' } ).click()
  await expect( page ).toHaveURL( /\/melete/ )

  // The folder goes away on the host while the user is signed in.
  rmSync( join( vaultsDir(), 'lost-vault' ), { recursive: true, force: true } )

  // The container sees the host's change a moment later through the bind mount.
  await expect.poll( async () => {
    const me = await ( await context.request.get( '/api/me' ) ).json() as { vault_missing: boolean }

    return me.vault_missing
  } ).toBe( true )

  await page.goto( '/melete' )
  await expect( page.getByRole( 'heading', { name: 'Choose your vault' } ) ).toBeVisible()
  await expect( page.getByRole( 'alert' ) )
    .toContainText( 'Your vault folder lost-vault is missing' )

  await page.getByLabel( 'New vault name' ).fill( 'found-vault' )
  await page.getByRole( 'button', { name: 'Create vault' } ).click()
  await expect( page ).toHaveURL( /\/melete/ )
  await expect( page.getByRole( 'heading', { name: 'Choose your vault' } ) ).toHaveCount( 0 )

  await context.close()
} )
