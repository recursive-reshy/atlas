import { execFileSync } from 'node:child_process'
import { expect, signIn, test } from './signedIn.js'

const PROJECT = 'atlas-e2e'
const LONG_AGO = '2020-01-01T00:00:00.000Z'

// A goal made during the run did not exist before last week ended, so no check-in is due for it.
// The goal is back-dated in the stack's own database, from the host through Docker: it only
// touches the throwaway e2e stack (run.sh's project), never a real instance.
const backdateGoal = ( name: string ): void => {
  const container = execFileSync( 'docker', [
    'ps',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${ PROJECT }`,
    '--filter',
    'label=com.docker.compose.service=app',
  ] ).toString().trim()

  if( container === '' ) {
    throw new Error( `No running app container in the ${ PROJECT } stack` )
  }

  const script = [
    'const { DatabaseSync } = require( \'node:sqlite\' )',
    'const db = new DatabaseSync( \'/data/atlas.db\' )',
    'db.exec( \'PRAGMA busy_timeout = 5000\' )',
    'const result = db.prepare( \'UPDATE themis_goals SET created_at = ? WHERE name = ?\' )',
    `  .run( '${ LONG_AGO }', process.argv[ 1 ] )`,
    'if( result.changes !== 1 ) { process.exit( 1 ) }',
  ].join( '\n' )

  execFileSync(
    'docker',
    [ 'exec', '-u', 'node', container, 'node', '-e', script, name ],
    { stdio: 'pipe' },
  )
}

test( 'areas and goals, a linked subject, measured and logged time, and a check-in', async ( {
  page,
  context,
} ) => {
  const { request } = context

  await signIn( context, {
    email: 'planner@e2e.test',
    modules: [ 'melete', 'themis' ],
    vault_dir: 'planner',
  } )

  // The subject and its measured time come from the API: one enrolled note and one answer
  expect( ( await request.patch(
    '/api/settings',
    { data: { melete_learning_root: 'Learning' } },
  ) ).status() ).toBe( 200 )

  const today = await ( await request.get( '/api/melete/today' ) ).json() as {
    subjects: { id: string }[]
  }
  const [ subject ] = today.subjects

  expect( ( await request.post(
    `/api/melete/subjects/${ subject.id }/enrollment`,
    { data: { enrolled: true } },
  ) ).status() ).toBe( 200 )

  let questionId = ''

  await expect( async () => {
    const next = await ( await request.get( '/api/melete/review/next' ) ).json() as {
      item: { question: { id: string } } | null
    }

    expect( next.item ).not.toBeNull()
    questionId = next.item?.question.id ?? ''
  } ).toPass( { timeout: 60_000 } )

  expect( ( await request.post(
    `/api/melete/questions/${ questionId }/review`,
    { data: { rating: 'easy', mode: 'quick' } },
  ) ).status() ).toBe( 200 )

  // Themis starts empty; Home at / is covered by home-calendar.spec.ts
  await page.goto( '/themis' )
  await expect( page ).toHaveURL( /\/themis/ )
  await expect( page.getByRole( 'heading', { name: 'Add your first area' } ) ).toBeVisible()
  await page.getByRole( 'textbox', { name: 'Area name' } ).fill( 'Career' )
  await page.getByRole( 'button', { name: 'Add area' } ).click()
  await expect( page.getByRole( 'region', { name: 'Career' } ) ).toBeVisible()

  // A learning goal and a weekly check-in goal
  await page.getByRole( 'button', { name: 'Add goal to Career' } ).click()

  let dialog = page.getByRole( 'dialog', { name: 'New goal' } )

  await dialog.getByRole( 'textbox', { name: 'Goal name' } ).fill( 'Learn data engineering' )
  await dialog.getByRole( 'button', { name: 'Create goal' } ).click()
  await expect( dialog ).toHaveCount( 0 )

  await page.getByRole( 'button', { name: 'Add goal to Career' } ).click()
  dialog = page.getByRole( 'dialog', { name: 'New goal' } )
  await dialog.getByRole( 'textbox', { name: 'Goal name' } ).fill( 'Family time' )
  await dialog.getByRole( 'combobox', { name: 'Outcome' } ).selectOption( 'checkin' )
  await dialog.getByRole( 'button', { name: 'Create goal' } ).click()
  await expect( dialog ).toHaveCount( 0 )

  // Link the subject to the learning goal: its measured time follows it
  await page.getByRole( 'link', { name: 'Learn data engineering' } ).click()
  await page.getByRole( 'button', { name: 'Link subjects' } ).click()
  dialog = page.getByRole( 'dialog', { name: 'Link subjects' } )
  await dialog.getByRole( 'checkbox', { name: /E2E/ } ).check()
  await dialog.getByRole( 'button', { name: 'Save' } ).click()
  await expect( dialog ).toHaveCount( 0 )
  await expect( page.getByText( 'E2E', { exact: true } ) ).toBeVisible()

  // Log half an hour against the goal
  await page.goto( '/themis' )
  await page.getByRole( 'button', { name: 'Log time' } ).click()
  dialog = page.getByRole( 'dialog', { name: 'Log time' } )
  await dialog.getByRole( 'combobox', { name: 'Subject or goal' } )
    .selectOption( { label: 'Learn data engineering' } )
  await dialog.getByRole( 'button', { name: '30 min' } ).click()
  await dialog.getByRole( 'button', { name: 'Log time' } ).click()
  await expect( dialog ).toHaveCount( 0 )

  // Both shades show for the area: the answer's session and the logged half hour
  const career = page.getByRole( 'listitem', { name: 'Career' } )

  await expect( career.getByRole( 'img', { name: /^Measured/ } ) ).toBeVisible()
  await expect( career.getByRole( 'img', { name: /^Logged/ } ) ).toBeVisible()

  // Back-dated, the weekly check-in is due; one tap answers it and it goes
  backdateGoal( 'Family time' )
  await page.reload()
  await expect( page.getByRole( 'heading', { name: 'Check-ins due' } ) ).toBeVisible()
  await page.getByRole( 'button', { name: 'Rate 4 out of 5' } ).click()
  await expect( page.getByRole( 'heading', { name: 'Check-ins due' } ) ).toHaveCount( 0 )
} )
