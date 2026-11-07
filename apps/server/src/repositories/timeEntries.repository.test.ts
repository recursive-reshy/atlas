// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  extendMeasuredEntry,
  insertMeasuredEntry,
  latestMeasuredEntry,
  sumSubjectSeconds,
} from './timeEntries.repository.js'
import { getDatabase } from './database.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''

const session = ( start: string, end: string, day = '2026-11-10' ) => ( {
  started_at: start,
  ended_at: end,
  day,
  seconds: 60,
} )

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
} )

describe( 'insertMeasuredEntry and latestMeasuredEntry', () => {
  it( 'stores a measured session and finds the one that ended last', () => {
    const first = insertMeasuredEntry( userId, subjectId, session(
      '2026-11-10T09:00:00.000Z',
      '2026-11-10T09:02:00.000Z',
    ) )
    const second = insertMeasuredEntry( userId, subjectId, session(
      '2026-11-10T10:00:00.000Z',
      '2026-11-10T10:03:00.000Z',
    ) )

    expect( latestMeasuredEntry( userId, subjectId ) ).toEqual( {
      id: second,
      started_at: '2026-11-10T10:00:00.000Z',
      ended_at: '2026-11-10T10:03:00.000Z',
      day: '2026-11-10',
    } )
    expect( first ).not.toBe( second )
  } )

  it( 'finds nothing for another subject or another user', () => {
    insertMeasuredEntry( userId, subjectId, session(
      '2026-11-10T09:00:00.000Z',
      '2026-11-10T09:00:00.000Z',
    ) )

    expect( latestMeasuredEntry( userId, addSubject( userId, 'Learning/Other' ) ) )
      .toBeUndefined()
    expect( latestMeasuredEntry( createTestUser().id, subjectId ) ).toBeUndefined()
  } )

  it( 'ignores logged entries', () => {
    getDatabase().prepare( `INSERT INTO time_entries
      ( id, user_id, source, subject_id, day, seconds, created_at, updated_at )
      VALUES ( 'l1', ?, 'logged', ?, '2026-11-10', 600, 'x', 'x' )` ).run( userId, subjectId )

    expect( latestMeasuredEntry( userId, subjectId ) ).toBeUndefined()
  } )
} )

describe( 'extendMeasuredEntry', () => {
  it( 'moves the end and the seconds on, and keeps the start and day', () => {
    const id = insertMeasuredEntry( userId, subjectId, session(
      '2026-11-10T09:00:00.000Z',
      '2026-11-10T09:00:00.000Z',
    ) )

    extendMeasuredEntry( userId, id, { ended_at: '2026-11-10T09:04:00.000Z', seconds: 270 } )

    expect( latestMeasuredEntry( userId, subjectId ) ).toEqual( {
      id,
      started_at: '2026-11-10T09:00:00.000Z',
      ended_at: '2026-11-10T09:04:00.000Z',
      day: '2026-11-10',
    } )
    expect( getDatabase().prepare( 'SELECT seconds FROM time_entries WHERE id = ?' ).get( id ) )
      .toEqual( { seconds: 270 } )
  } )

  it( 'leaves another user\'s entry alone', () => {
    const id = insertMeasuredEntry( userId, subjectId, session(
      '2026-11-10T09:00:00.000Z',
      '2026-11-10T09:00:00.000Z',
    ) )

    extendMeasuredEntry( createTestUser().id, id, {
      ended_at: '2026-11-10T09:04:00.000Z',
      seconds: 270,
    } )

    expect( latestMeasuredEntry( userId, subjectId )?.ended_at ).toBe( '2026-11-10T09:00:00.000Z' )
  } )
} )

describe( 'sumSubjectSeconds', () => {
  it( 'adds the subject\'s entries of every source on the days given, inclusive', () => {
    insertMeasuredEntry( userId, subjectId, { ...session( 'a', 'a', '2026-11-08' ), seconds: 100 } )
    insertMeasuredEntry( userId, subjectId, { ...session( 'b', 'b', '2026-11-09' ), seconds: 200 } )
    insertMeasuredEntry( userId, subjectId, { ...session( 'c', 'c', '2026-11-15' ), seconds: 400 } )
    insertMeasuredEntry( userId, subjectId, { ...session( 'd', 'd', '2026-11-16' ), seconds: 800 } )
    getDatabase().prepare( `INSERT INTO time_entries
      ( id, user_id, source, subject_id, day, seconds, created_at, updated_at )
      VALUES ( 'l1', ?, 'logged', ?, '2026-11-12', 1000, 'x', 'x' )` ).run( userId, subjectId )

    expect( sumSubjectSeconds( userId, subjectId, '2026-11-09', '2026-11-15' ) ).toBe( 1600 )
    expect( sumSubjectSeconds( userId, subjectId, '2026-12-01', '2026-12-07' ) ).toBe( 0 )
  } )

  it( 'does not count another subject\'s or another user\'s time', () => {
    const other = addSubject( userId, 'Learning/Other' )

    insertMeasuredEntry( userId, other, { ...session( 'a', 'a', '2026-11-10' ), seconds: 50 } )

    expect( sumSubjectSeconds( userId, subjectId, '2026-11-09', '2026-11-15' ) ).toBe( 0 )
    expect( sumSubjectSeconds( createTestUser().id, other, '2026-11-09', '2026-11-15' ) ).toBe( 0 )
  } )
} )
