import { expect, test } from './signedIn.js'

test( 'the home page loads with the submit form', async ( { page } ) => {
  await page.goto( '/transcriber' )

  await expect( page.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeVisible()
  await expect( page.getByLabel( 'URL' ) ).toBeVisible()
} )
