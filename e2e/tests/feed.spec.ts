import { expect, test } from './signedIn.js'

test( 'a feed is added, checked and its items wait in the inbox', async ( { page } ) => {
  await page.goto( '/settings/sources' )
  await page.getByRole( 'button', { name: 'Add feed' } ).click()

  const dialog = page.getByRole( 'dialog', { name: 'Add feed' } )

  await dialog.getByLabel( 'Feed or page address' ).fill( 'http://fakes:4000/feed.xml' )
  await dialog.getByRole( 'button', { name: 'Find feed' } ).click()
  await dialog.getByRole( 'button', { name: 'Add', exact: true } ).click()

  const feeds = page.getByRole( 'list', { name: 'Feeds' } )

  await expect( feeds.getByText( 'Fixture Feed' ) ).toBeVisible()

  // Gmail has its own (disabled, as it is not connected) button of the same name since 0.9
  await page.getByRole( 'button', { name: 'Check all now', disabled: false } ).click()

  await page.goto( '/transcriber' )

  const inbox = page.getByRole( 'list', { name: 'Inbox items' } )

  // ADR 0032: a new feed's back catalogue is stored as seen; only the newest item waits in the inbox.
  await expect( page.getByRole( 'heading', { name: 'Inbox (1)' } ) ).toBeVisible()
  await expect( inbox.getByText( 'How Memory Really Works' ) ).toBeVisible()
  await expect( inbox.getByText( 'Notes That Last' ) ).toHaveCount( 0 )
} )
