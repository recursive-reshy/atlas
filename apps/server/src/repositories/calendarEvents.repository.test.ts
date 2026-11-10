// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  countEvents,
  deleteDrafts,
  removeImported,
} from './calendarEvents.repository.js'
import { getDatabase } from './database.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''

const AT = '2026-11-10T09:00:00.000Z'

const insertEvent = (
  id: string,
  status: 'draft' | 'approved' | 'dismissed',
  overrides: { user?: string, calendar?: string, entry?: string | null } = {},
): void => {
  getDatabase().prepare( `INSERT INTO calendar_events ( id, user_id, calendar_id, event_id, title,
    started_at, ended_at, day, seconds, status, time_entry_id, created_at, updated_at )
    VALUES ( ?, ?, ?, ?, 'Gym', '2026-11-09T07:00:00.000Z', '2026-11-09T08:00:00.000Z',
      '2026-11-09', 3600, ?, ?, ?, ? )` )
    .run(
      id, 
      overrides.user ?? userId, 
      overrides.calendar ?? 'cal-1', 
      id, 
      status,
      overrides.entry ?? null, 
      AT, 
      AT, 
    )
}

const insertEntry = ( id: string ): void => {
  getDatabase().prepare( `INSERT INTO time_entries ( id, user_id, source, subject_id, goal_id,
    day, started_at, ended_at, seconds, note, created_at, updated_at )
    VALUES ( ?, ?, 'calendar', ?, NULL, '2026-11-09', NULL, NULL, 3600, NULL, ?, ? )` )
    .run( id, userId, subjectId, AT, AT )
}

const ids = (): string[] => ( getDatabase()
  .prepare( 'SELECT id FROM calendar_events ORDER BY id' ).all() as { id: string }[] )
  .map( ( { id } ) => id )

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
} )

describe( 'deleteDrafts', () => {
  it( 'deletes the drafts of one calendar and keeps approved and dismissed markers', () => {
    insertEvent( 'draft-1', 'draft' )
    insertEvent( 'approved-1', 'approved' )
    insertEvent( 'dismissed-1', 'dismissed' )
    insertEvent( 'draft-other-cal', 'draft', { calendar: 'cal-2' } )

    deleteDrafts( userId, 'cal-1' )

    expect( ids() ).toEqual( [ 'approved-1', 'dismissed-1', 'draft-other-cal' ] )
  } )

  it( 'leaves another user\'s drafts alone', () => {
    insertEvent( 'mine', 'draft' )
    insertEvent( 'theirs', 'draft', { user: createTestUser().id } )

    deleteDrafts( userId, 'cal-1' )

    expect( ids() ).toEqual( [ 'theirs' ] )
  } )
} )

describe( 'removeImported', () => {
  it( 'deletes the calendar\'s events and the time they recorded, not other calendars\'', () => {
    insertEntry( 'entry-1' )
    insertEntry( 'entry-2' )
    insertEvent( 'approved-1', 'approved', { entry: 'entry-1' } )
    insertEvent( 'approved-other', 'approved', { calendar: 'cal-2', entry: 'entry-2' } )
    insertEvent( 'draft-1', 'draft' )

    removeImported( userId, 'cal-1' )

    expect( ids() ).toEqual( [ 'approved-other' ] )
    expect( ( getDatabase().prepare( 'SELECT id FROM time_entries' ).all() as { id: string }[] )
      .map( ( { id } ) => id ) ).toEqual( [ 'entry-2' ] )
  } )

  it( 'keeps a time entry the person made by hand', () => {
    insertEntry( 'entry-1' )
    removeImported( userId, 'cal-1' )

    expect( getDatabase().prepare( 'SELECT id FROM time_entries' ).all() ).toHaveLength( 1 )
  } )
} )

describe( 'countEvents', () => {
  it( 'counts a user\'s events by status', () => {
    insertEvent( 'a', 'draft' )
    insertEvent( 'b', 'draft' )
    insertEvent( 'c', 'approved' )
    insertEvent( 'd', 'draft', { user: createTestUser().id } )

    expect( countEvents( userId, 'draft' ) ).toBe( 2 )
    expect( countEvents( userId, 'approved' ) ).toBe( 1 )
    expect( countEvents( userId, 'dismissed' ) ).toBe( 0 )
  } )
} )
