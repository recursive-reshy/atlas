import { execFileSync } from 'node:child_process'
import { expect, signIn, test } from './signedIn.js'

const PROJECT = 'atlas-e2e'
const EMAIL = 'calendar@e2e.test'
const CALENDAR_ID = 'e2e-cal'
const MINUTE = 60_000
const HOUR = 60 * MINUTE

// The consent screen is not in e2e, so the connected account is written into the stack's own
// database through Docker, like themis.spec.ts back-dates a goal: the token is encrypted with the
// stack's key, the same way the server does. It only touches the throwaway e2e stack.
const SEED = `
const { DatabaseSync } = require( 'node:sqlite' )
const { createCipheriv, randomBytes, randomUUID } = require( 'node:crypto' )
const [ email, importFrom, subjectId, measuredFrom, measuredTo ] = process.argv.slice( 1 )
const db = new DatabaseSync( '/data/atlas.db' )
db.exec( 'PRAGMA busy_timeout = 5000' )
const user = db.prepare( 'SELECT id FROM users WHERE email = ?' ).get( email )
const key = Buffer.from( process.env.TOKEN_ENCRYPTION_KEY, 'base64' )
const iv = randomBytes( 12 )
const cipher = createCipheriv( 'aes-256-gcm', key, iv )
const body = Buffer.concat( [ cipher.update( 'e2e-refresh-token', 'utf8' ), cipher.final() ] )
const token = [ 'v1', iv.toString( 'base64' ), cipher.getAuthTag().toString( 'base64' ),
  body.toString( 'base64' ) ].join( ':' )
const now = new Date().toISOString()
db.prepare( 'INSERT INTO calendar_account ( user_id, email, refresh_token_enc, scope, status, '
  + 'connected_at, calendar_id, calendar_name, import_from ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
  .run( user.id, email, token, 'e2e', 'connected', now, '${ CALENDAR_ID }', 'E2E calendar',
    importFrom )
const seconds = ( Date.parse( measuredTo ) - Date.parse( measuredFrom ) ) / 1000
db.prepare( 'INSERT INTO time_entries ( id, user_id, source, subject_id, day, started_at, '
  + 'ended_at, seconds, created_at, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
  .run( randomUUID(), user.id, 'measured', subjectId, measuredFrom.slice( 0, 10 ), measuredFrom,
    measuredTo, seconds, now, now )
`

const appContainer = (): string => {
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

  return container
}

const seedAccount = ( args: string[] ): void => {
  execFileSync(
    'docker',
    [ 'exec', '-u', 'node', appContainer(), 'node', '-e', SEED, ...args ],
    { stdio: 'pipe' },
  )
}

// The fakes server is only on the Compose network, so the events go in from the app container
const PUT_EVENTS = `
fetch( 'http://fakes:4000/__calendar/events', { method: 'PUT', body: process.argv[ 1 ] } )
  .then( ( response ) => process.exit( response.status === 204 ? 0 : 1 ), () => process.exit( 1 ) )
`

const setEvents = ( events: unknown[] ): void => {
  execFileSync(
    'docker',
    [ 'exec', '-u', 'node', appContainer(), 'node', '-e', PUT_EVENTS, JSON.stringify( events ) ],
    { stdio: 'pipe' },
  )
}

const timed = ( id: string, summary: string, from: number, to: number ) => ( {
  id,
  summary,
  start: { dateTime: new Date( from ).toISOString() },
  end: { dateTime: new Date( to ).toISOString() },
} )

test( 'a connected calendar: three drafts reviewed on Home, time counted once', async ( {
  page,
  context,
} ) => {
  const { request } = context

  await signIn( context, {
    email: EMAIL,
    modules: [ 'transcriber', 'melete', 'themis' ],
    vault_dir: 'calendar',
  } )

  // The subject comes from the vault; the area, goal and rule from the API
  expect( ( await request.patch(
    '/api/settings',
    { data: { melete_learning_root: 'Learning' } },
  ) ).status() ).toBe( 200 )

  const today = await ( await request.get( '/api/melete/today' ) ).json() as {
    subjects: { id: string }[]
  }
  const [ subject ] = today.subjects
  const area = await ( await request.post(
    '/api/themis/areas',
    { data: { name: 'Work' } },
  ) ).json() as { area: { id: string } }
  const goalOf = async ( name: string ): Promise< string > => {
    const response = await request.post(
      '/api/themis/goals',
      { data: { area_id: area.area.id, name, outcome: 'learning' } },
    )

    expect( response.status() ).toBe( 201 )

    return ( await response.json() as { goal: { id: string } } ).goal.id
  }
  const meetings = await goalOf( 'Meetings' )
  await goalOf( 'Health' )

  expect( ( await request.post(
    '/api/calendar/rules',
    { data: { phrase: 'standup', goal_id: meetings } },
  ) ).status() ).toBe( 201 )

  // Three finished events: a Standup (matches the rule), a Dentist visit (no rule) and a study
  // block whose first 20 minutes the learner already measured in Melete
  const now = Date.now()
  const studyFrom = now - 5 * HOUR
  const events = [
    timed( 'e2e-study', 'Study block', studyFrom, studyFrom + HOUR ),
    timed( 'e2e-standup', 'Standup', now - 3 * HOUR, now - 3 * HOUR + 15 * MINUTE ),
    timed( 'e2e-dentist', 'Dentist', now - 2 * HOUR, now - 2 * HOUR + 30 * MINUTE ),
  ]

  setEvents( events )

  seedAccount( [
    EMAIL,
    new Date( now - 7 * 24 * HOUR ).toISOString().slice( 0, 10 ),
    subject.id,
    new Date( studyFrom ).toISOString(),
    new Date( studyFrom + 20 * MINUTE ).toISOString(),
  ] )

  // Home reads the calendar on open
  await page.goto( '/' )
  await expect( page.getByRole( 'link', { name: '3 calendar drafts to review' } ) ).toBeVisible()
  await page.getByRole( 'link', { name: '3 calendar drafts to review' } ).click()
  await expect( page ).toHaveURL( /\/themis\/calendar/ )

  // The Standup went to Meetings by its rule; one tap approves it
  await page.getByRole( 'button', { name: 'Approve all matched (1)' } ).click()
  await expect( page.getByText( 'Approved 1 draft' ) ).toBeVisible()
  await expect( page.getByText( 'Standup', { exact: true } ) ).toHaveCount( 0 )

  // The Dentist visit needs a target
  const dentist = page.getByRole( 'listitem' ).filter( { hasText: 'Dentist' } )

  await dentist.getByLabel( 'Counts toward' ).selectOption( { label: 'Health' } )
  await dentist.getByRole( 'button', { name: 'Approve' } ).click()
  await expect( page.getByText( 'Recorded 30 min' ) ).toBeVisible()

  // The study block counts 40 of its 60 minutes: 20 were already measured
  const study = page.getByRole( 'listitem' ).filter( { hasText: 'Study block' } )

  await study.getByLabel( 'Counts toward' ).selectOption( { label: 'E2E' } )
  await expect( study.getByText( '1 h · 20 min already measured · counts 40 min' ) ).toBeVisible()
  await study.getByRole( 'button', { name: 'Approve' } ).click()
  await expect( page.getByText( 'Recorded 40 min' ) ).toBeVisible()

  // Home shows the calendar shade in the area's bar, and nothing is left to review
  await page.goto( '/' )
  await expect(
    page.getByRole( 'listitem', { name: 'Work' } ).getByRole( 'img', { name: /^Calendar/ } ),
  ).toBeVisible()
  await expect( page.getByRole( 'link', { name: /calendar drafts? to review/ } ) ).toHaveCount( 0 )

  // The old job address lands on the transcriber's
  const queued = await request.post( '/api/jobs', { data: { url: 'http://fakes:4000/article' } } )

  expect( queued.status() ).toBe( 202 )

  const { job_id: jobId } = await queued.json() as { job_id: string }

  await page.goto( `/jobs/${ jobId }` )
  await expect( page ).toHaveURL( new RegExp( `/transcriber/jobs/${ jobId }$` ) )
} )
