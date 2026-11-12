import { expect, signIn, test } from './signedIn.js'

const ARTICLE = 'http://fakes:4000/article'

test( 'a member sees only their modules and none of the admin\'s data', async ( {
  playwright,
  baseURL,
  browser,
} ) => {
  // The admin queues a job through the API.
  const admin = await playwright.request.newContext( { baseURL } )

  await signIn( admin, { email: 'admin@e2e.test', vault_dir: 'admin' } )

  const created = await admin.post( '/api/jobs', { data: { url: ARTICLE } } )

  expect( created.status() ).toBe( 202 )

  const { job_id: jobId } = await created.json() as { job_id: string }

  // A member with Melete only, who has not chosen a vault yet.
  const context = await browser.newContext( { baseURL } )
  const page = await context.newPage()

  await signIn( context, { email: 'member@e2e.test', modules: [ 'melete' ] } )
  await page.goto( '/transcriber' )

  // First sign-in: choose a vault before anything else.
  await expect( page.getByRole( 'heading', { name: 'Choose your vault' } ) ).toBeVisible()
  await page.getByRole( 'radio', { name: 'member' } ).check()
  await page.getByRole( 'button', { name: 'Use this vault' } ).click()

  // The home page is their first module, and the others are not in the drawer.
  await expect( page ).toHaveURL( /\/melete/ )

  const drawer = page.getByRole( 'navigation', { name: 'Main' } )

  await expect( drawer.getByRole( 'link', { name: 'Melete' } ) ).toBeVisible()
  await expect( drawer.getByRole( 'link', { name: 'Mnemosyne' } ) ).toHaveCount( 0 )

  // Settings has no Admin tab, and the admin's job is not theirs to see.
  await page.goto( '/settings/admin' )
  await expect( page.getByRole( 'tab', { name: 'Admin' } ) ).toHaveCount( 0 )
  expect( ( await context.request.get( '/api/admin/users' ) ).status() ).toBe( 404 )
  expect( ( await context.request.get( `/api/jobs/${ jobId }` ) ).status() ).toBe( 404 )

  // With Transcriber on, the job is still the admin's: a 404, not a 403.
  await signIn( context, { email: 'member@e2e.test', modules: [ 'transcriber', 'melete' ] } )
  expect( ( await context.request.get( `/api/jobs/${ jobId }` ) ).status() ).toBe( 404 )

  await admin.dispose()
  await context.close()
} )
