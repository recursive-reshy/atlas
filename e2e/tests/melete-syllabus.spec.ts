import { expect, signIn, test } from './signedIn.js'

test( 'a subject gets a syllabus, its note is mapped, gaps get suggestions and a review adds time', async ( {
  page,
  context,
} ) => {
  await signIn( context, { email: 'learner@e2e.test', modules: [ 'melete' ], vault_dir: 'learner' } )

  const settings = await context.request.patch(
    '/api/settings',
    { data: { melete_learning_root: 'Learning' } },
  )

  expect( settings.status() ).toBe( 200 )

  await page.goto( '/melete' )
  await page.getByRole( 'link', { name: 'E2E', exact: true } ).click()
  await page.getByRole( 'tab', { name: 'Settings' } ).click()
  await page.getByRole( 'button', { name: 'Enroll all', exact: true } ).click()
  await page.getByRole( 'tab', { name: 'Notes' } ).click()
  await expect( page.getByText( '2 questions' ) ).toBeVisible()

  // Level, draft, approve: the fake drafts two concepts in one section
  await page.getByRole( 'tab', { name: 'Syllabus' } ).click()
  await page.getByRole( 'radio', { name: /Working knowledge/ } ).check()
  await page.getByRole( 'button', { name: 'Draft syllabus' } ).click()
  await expect( page.getByRole( 'button', { name: 'Approve' } ) ).toBeVisible()
  await page.getByRole( 'button', { name: 'Approve' } ).click()
  await expect( page.getByText( 'Approved', { exact: true } ) ).toBeVisible()

  // The loop maps the enrolled note in the background; the fake puts it on the first concept, so
  // one of the two concepts is covered
  await page.getByRole( 'tab', { name: 'Overview' } ).click()
  await expect( async () => {
    await page.reload()
    await expect( page.getByText( 'Coverage 50%', { exact: true } ) ).toBeVisible( { timeout: 2000 } )
  } ).toPass( { timeout: 60_000 } )

  // The concept with no note offers resources, and the answer has searches but no links of its own
  await page.getByRole( 'button', { name: 'Suggest resources for Spaced repetition' } ).click()
  await expect( page.getByText( 'Make It Stick' ) ).toBeVisible()

  const resources = page.getByRole( 'list' ).filter( { hasText: 'Make It Stick' } )

  await expect( resources ).not.toContainText( 'http' )
  await expect( page.getByRole( 'link', { name: 'Search for Spaced repetition explained' } ) )
    .toHaveAttribute( 'href', /youtube\.com\/results/ )
  await expect( page.getByRole( 'link', { name: 'Search for Make It Stick' } ) )
    .toHaveAttribute( 'href', /google\.com\/search/ )

  // One answer in the concept's review makes a measured session, shown on the subject's card
  await page.getByRole( 'link', { name: 'Review Active recall' } ).click()
  await page.getByLabel( 'Your answer' ).fill( 'Remembering an idea instead of rereading it.' )
  await page.getByRole( 'button', { name: 'Check' } ).click()
  await expect( page.getByRole( 'heading', { name: 'Missed' } ) ).toBeVisible()
  await page.getByRole( 'button', { name: 'Next' } ).click()

  await page.goto( '/melete' )
  await expect( page.getByText( /· 1 min this week/ ) ).toBeVisible()
} )
