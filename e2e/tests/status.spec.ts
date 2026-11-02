import { expect, test } from './signedIn.js'

test( 'nothing is failing', async ( { page } ) => {
  await page.goto( '/settings/sources' )

  const status = page.getByRole( 'heading', { name: 'Status' } ).locator( '..' )

  await expect( status.getByText( 'Loading status…' ) ).toBeHidden()
  await expect( status.getByRole( 'row', { name: /transcription/i } ) ).toContainText( 'OK' )
  await expect( status.getByText( 'Failing' ) ).toHaveCount( 0 )
  await expect( status.getByRole( 'button', { name: 'Back up now' } ) ).toHaveCount( 0 )
  await expect( page.getByRole( 'link', { name: 'Settings', exact: true } ) ).toBeVisible()
} )
