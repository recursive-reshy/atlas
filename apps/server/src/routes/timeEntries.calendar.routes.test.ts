// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Shared
import { ListTimeEntriesResponse, TimeEntryResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertArea } from '../repositories/themisAreas.repository.js'
import { insertGoal } from '../repositories/themisGoals.repository.js'
import {
  insertCalendarEntry,
  insertLoggedEntry,
  insertMeasuredEntry,
} from '../repositories/timeEntries.repository.js'
// Themis
import { addDays, studyDay } from '../themis/periods.js'
// Test support
import {
  createTestUser,
  defaultTestAdmin,
  signedInRequest as request,
} from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

const AT = '2026-11-10T09:00:00.000Z'
const TODAY = studyDay( new Date() )

let user: TestUser
let subject = ''
let goal = ''

const goalOf = ( owner: string, name = 'Fit' ): string => insertGoal( owner, {
  area_id: insertArea( owner, `Area ${ name }` ).id,
  name,
  outcome: 'learning',
} ).id

const calendarEntry = ( owner = user, target: { subject?: string, goal?: string } = {} ) => {
  const useGoal = target.goal !== undefined

  return insertCalendarEntry( owner.id, {
    subject_id: useGoal ? null : target.subject ?? subject,
    goal_id: useGoal ? target.goal ?? null : null,
    day: TODAY,
    started_at: '2026-11-09T07:00:00.000Z',
    ended_at: '2026-11-09T08:00:00.000Z',
    seconds: 3600,
    note: 'Gym',
  } ).id
}

const patch = ( id: string, body: unknown, as = user ) => request( app, as )
  .patch( `/api/time-entries/${ id }` ).send( body as object )

beforeEach( () => {
  user = defaultTestAdmin()
  subject = addSubject( user.id )
  goal = goalOf( user.id )
} )

describe( 'PATCH /api/time-entries/:id for a calendar entry', () => {
  it( 'edits the minutes, day and note', async () => {
    const id = calendarEntry()
    const response = await patch( id, { minutes: 45, day: addDays( TODAY, -1 ), note: 'Leg day' } )

    expect( response.status ).toBe( 200 )
    expect( TimeEntryResponse.parse( response.body ).entry ).toMatchObject( {
      id,
      source: 'calendar',
      seconds: 2700,
      day: addDays( TODAY, -1 ),
      note: 'Leg day',
    } )
    expect( TimeEntryResponse.parse( ( await patch( id, { note: null } ) ).body ).entry.note )
      .toBeNull()
  } )

  it( 'moves it from a subject to a goal, and back', async () => {
    const id = calendarEntry()

    expect( TimeEntryResponse.parse( ( await patch( id, { goal_id: goal } ) ).body ).entry )
      .toMatchObject( { goal_id: goal, subject_id: null } )
    expect( TimeEntryResponse.parse( ( await patch( id, { subject_id: subject } ) ).body ).entry )
      .toMatchObject( { goal_id: null, subject_id: subject } )
  } )

  it( 'refuses both targets, a bad day, bad minutes and an empty body with 400', async () => {
    const id = calendarEntry()

    for( const body of [
      { goal_id: goal, subject_id: subject },
      { day: addDays( TODAY, 1 ) },
      { day: addDays( TODAY, -366 ) },
      { minutes: 0 },
      {},
    ] ) {
      expect( ( await patch( id, body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }
  } )

  it( 'is 404 for a target that is not the user\'s own, or needs a module they lack', async () => {
    const other = createTestUser()
    const member = createTestUser( { modules: [ 'themis' ] } )
    const mine = calendarEntry( member, { goal: goalOf( member.id ) } )

    expect( ( await patch( calendarEntry(), { goal_id: goalOf( other.id ) } ) ).status ).toBe( 404 )
    expect( ( await patch( calendarEntry(), { subject_id: addSubject( other.id ) } ) ).status )
      .toBe( 404 )
    expect( ( await patch( mine, { subject_id: addSubject( member.id ) }, member ) ).status )
      .toBe( 404 )
  } )

  it( 'is 404 for another user\'s entry', async () => {
    expect( ( await patch( calendarEntry(), { minutes: 5 }, createTestUser() ) ).status )
      .toBe( 404 )
  } )

  it( 'still refuses a target for a logged entry and any edit of measured time', async () => {
    const logged = insertLoggedEntry( user.id, {
      subject_id: subject,
      goal_id: null,
      day: TODAY,
      seconds: 60,
      note: null,
    } ).id
    const measured = insertMeasuredEntry( user.id, subject, {
      started_at: AT,
      ended_at: AT,
      day: TODAY,
      seconds: 30,
    } )

    expect( ( await patch( logged, { goal_id: goal } ) ).status ).toBe( 400 )
    expect( ( await patch( logged, { minutes: 5 } ) ).status ).toBe( 200 )
    expect( ( await patch( measured, { minutes: 5 } ) ).status ).toBe( 409 )
    expect( ( await patch( measured, { goal_id: goal } ) ).status ).toBe( 409 )
  } )
} )

describe( 'DELETE /api/time-entries/:id for a calendar entry', () => {
  it( 'deletes the entry and leaves its event approved, with no entry behind it', async () => {
    const id = calendarEntry()

    getDatabase().prepare( `INSERT INTO calendar_events ( id, user_id, calendar_id, event_id,
      title, started_at, ended_at, day, seconds, status, time_entry_id, created_at, updated_at )
      VALUES ( 'ev', ?, 'cal-1', 'g-1', 'Gym', ?, ?, ?, 3600, 'approved', ?, ?, ? )` )
      .run( user.id, AT, AT, TODAY, id, AT, AT )

    expect( ( await request( app ).delete( `/api/time-entries/${ id }` ) ).status ).toBe( 204 )
    expect( getDatabase().prepare( 'SELECT status, time_entry_id FROM calendar_events' ).get() )
      .toEqual( { status: 'approved', time_entry_id: null } )
    expect( getDatabase().prepare( 'SELECT id FROM time_entries' ).all() ).toEqual( [] )
  } )

  it( 'is 404 for another user\'s entry, and measured time stays 409', async () => {
    const id = calendarEntry()
    const measured = insertMeasuredEntry( user.id, subject, {
      started_at: AT,
      ended_at: AT,
      day: TODAY,
      seconds: 30,
    } )

    const stranger = request( app, createTestUser() )

    expect( ( await stranger.delete( `/api/time-entries/${ id }` ) ).status ).toBe( 404 )
    expect( ( await request( app ).delete( `/api/time-entries/${ measured }` ) ).status )
      .toBe( 409 )
  } )
} )

describe( 'GET /api/time-entries with calendar entries', () => {
  it( 'lists them with their source', async () => {
    calendarEntry()

    const response = await request( app ).get( `/api/time-entries?from=${ TODAY }&to=${ TODAY }` )

    expect( ListTimeEntriesResponse.parse( response.body ).entries )
      .toMatchObject( [ { source: 'calendar', seconds: 3600, note: 'Gym' } ] )
  } )
} )
