import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './signedIn.js'

const vaultDir = (): string => {
  const adminVault = process.env.E2E_VAULT_DIR

  if( adminVault === undefined ) {
    throw new Error( 'E2E_VAULT_DIR is not set; run the tests with pnpm e2e' )
  }

  return adminVault
}

test( 'a note is enrolled, quizzed in typed and quick modes, and the app is installable', async ( {
  page,
  request,
} ) => {
  await page.goto( '/melete' )
  await page.getByRole( 'button', { name: 'Choose learning root' } ).click()

  const dialog = page.getByRole( 'dialog', { name: 'Learning root' } )

  // A learning root that doesn't exist yet is created by the save (ADR 0072)
  await dialog.getByRole( 'button', { name: 'Change folder' } ).click()
  await dialog.getByRole( 'textbox', { name: 'New folder name' } ).fill( 'Study' )
  await dialog.getByRole( 'button', { name: 'New folder', exact: true } ).click()
  await dialog.getByRole( 'button', { name: 'Save' } ).click()
  await expect( dialog ).toHaveCount( 0 )

  expect( existsSync( join( vaultDir(), 'Study' ) ) ).toBe( true )
  expect( statSync( join( vaultDir(), 'Study' ) ).isDirectory() ).toBe( true )

  // The rest of the flow runs on the seeded Learning folder
  await page.getByRole( 'button', { name: 'Change learning root' } ).click()
  await dialog.getByRole( 'button', { name: 'Change folder' } ).click()
  await dialog.getByRole( 'treeitem', { name: 'Learning' } ).click()
  await dialog.getByRole( 'button', { name: 'Save' } ).click()

  await page.getByRole( 'link', { name: 'E2E', exact: true } ).click()
  await page.getByRole( 'tab', { name: 'Settings' } ).click()
  await page.getByRole( 'button', { name: 'Enroll all', exact: true } ).click()
  await page.getByRole( 'tab', { name: 'Notes' } ).click()
  await expect( page.getByText( '2 questions' ) ).toBeVisible()

  await page.goto( '/melete' )
  await page.getByRole( 'link', { name: 'Start review' } ).click()

  // Typed mode: the fake grades the answer as partly right and suggests Hard.
  await page.getByLabel( 'Your answer' ).fill( 'Remembering an idea instead of rereading it.' )
  await page.getByRole( 'button', { name: 'Check' } ).click()
  await expect( page.getByRole( 'heading', { name: 'Missed' } ) ).toBeVisible()
  await expect( page.getByRole( 'button', { name: 'Hard' } ) ).toHaveAttribute( 'aria-pressed', 'true' )

  // The toggle applies from the next question, so switch before confirming this one.
  await page.getByRole( 'button', { name: 'Quick' } ).click()
  await page.getByRole( 'button', { name: 'Next' } ).click()

  await page.getByRole( 'button', { name: 'Show answer' } ).click()
  await page.getByRole( 'button', { name: 'Good' } ).click()
  await page.getByRole( 'button', { name: 'Next' } ).click()

  // Hard and Good leave both cards learning within 20 minutes, so they come straight back (ADR 0056).
  // Easy graduates a card, which is what lets the queue run dry.
  for( let round = 0; round < 2; round += 1 ) {
    await page.getByRole( 'button', { name: 'Show answer' } ).click()
    await page.getByRole( 'button', { name: 'Easy' } ).click()
    await page.getByRole( 'button', { name: 'Next' } ).click()
  }

  await expect( page.getByRole( 'heading', { name: 'All done for now' } ) ).toBeVisible()

  const manifest = await request.get( '/manifest.webmanifest' )

  expect( manifest.status() ).toBe( 200 )
  expect( ( await manifest.json() as { start_url: string } ).start_url ).toBe( '/melete' )
} )
