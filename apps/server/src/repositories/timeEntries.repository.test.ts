// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteCalendarEntry,
  deleteLoggedEntry,
  extendMeasuredEntry,
  findTimeEntry,
  goalTimeByDay,
  insertCalendarEntry,
  insertLoggedEntry,
  insertMeasuredEntry,
  latestMeasuredEntry,
  listTimeEntries,
  measuredIntervals,
  sumSubjectSeconds,
  timeByGoal,
  updateCalendarEntry,
  updateLoggedEntry,
} from './timeEntries.repository.js'
import { setSubjectsForGoal } from './meleteSubjects.repository.js'
import { insertArea } from './themisAreas.repository.js'
import { insertGoal } from './themisGoals.repository.js'
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

type Target = { subject_id: string } | { goal_id: string }

const logged = ( target: Target, day: string, seconds: number ) => ( {
  subject_id: null,
  goal_id: null,
  note: null,
  ...target,
  day,
  seconds,
} )

describe( 'insertLoggedEntry and findTimeEntry', () => {
  it( 'stores a logged entry against a subject, or a goal', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Career' ).id,
      name: 'G',
      outcome: 'learning',
    } ).id

    const forSubject = insertLoggedEntry( userId, {
      ...logged( { subject_id: subjectId }, '2026-11-10', 1800 ),
      note: 'chapter 3',
    } )
    const forGoal = insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-10', 600 ) )

    expect( forSubject ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      source: 'logged',
      subject_id: subjectId,
      goal_id: null,
      day: '2026-11-10',
      seconds: 1800,
      note: 'chapter 3',
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
      updated_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( forGoal ).toMatchObject( { goal_id: goal, subject_id: null } )
    expect( findTimeEntry( userId, forGoal.id ) ).toEqual( forGoal )
    expect( findTimeEntry( createTestUser().id, forGoal.id ) ).toBeUndefined()
  } )
} )

describe( 'updateLoggedEntry and deleteLoggedEntry', () => {
  it( 'changes the minutes, day and note of a logged entry', () => {
    const { id } = insertLoggedEntry(
      userId,
      logged( { subject_id: subjectId }, '2026-11-10', 60 ),
    )

    expect( updateLoggedEntry( userId, id, { seconds: 120, day: '2026-11-09', note: 'x' } ) )
      .toMatchObject( { seconds: 120, day: '2026-11-09', note: 'x' } )
    expect( updateLoggedEntry( userId, id, { note: null } ) ).toMatchObject( { note: null } )
  } )

  it( 'never touches a measured entry or another user\'s entry', () => {
    const measured = insertMeasuredEntry( userId, subjectId, session( 'a', 'a' ) )
    const { id } = insertLoggedEntry(
      userId,
      logged( { subject_id: subjectId }, '2026-11-10', 60 ),
    )
    const other = createTestUser().id

    expect( updateLoggedEntry( userId, measured, { seconds: 5 } ) ).toBeUndefined()
    expect( deleteLoggedEntry( userId, measured ) ).toBe( false )
    expect( updateLoggedEntry( other, id, { seconds: 5 } ) ).toBeUndefined()
    expect( deleteLoggedEntry( other, id ) ).toBe( false )
    expect( findTimeEntry( userId, measured )?.seconds ).toBe( 60 )
    expect( findTimeEntry( userId, id )?.seconds ).toBe( 60 )
  } )

  it( 'deletes a logged entry', () => {
    const { id } = insertLoggedEntry(
      userId,
      logged( { subject_id: subjectId }, '2026-11-10', 60 ),
    )

    expect( deleteLoggedEntry( userId, id ) ).toBe( true )
    expect( findTimeEntry( userId, id ) ).toBeUndefined()
  } )
} )

describe( 'listTimeEntries', () => {
  it( 'lists the user\'s entries on the days given, newest day first', () => {
    insertLoggedEntry( userId, logged( { subject_id: subjectId }, '2026-11-01', 60 ) )
    insertLoggedEntry( userId, logged( { subject_id: subjectId }, '2026-11-05', 60 ) )
    insertMeasuredEntry( userId, subjectId, session( 'a', 'a', '2026-11-03' ) )
    insertLoggedEntry( userId, logged( { subject_id: subjectId }, '2026-11-09', 60 ) )

    expect( listTimeEntries( userId, '2026-11-01', '2026-11-05' ).map( ( { day } ) => day ) )
      .toEqual( [ '2026-11-05', '2026-11-03', '2026-11-01' ] )
    expect( listTimeEntries( createTestUser().id, '2026-11-01', '2026-11-30' ) ).toEqual( [] )
  } )
} )

describe( 'calendar entries (ADR 0108)', () => {
  const insertCalendar = ( id: string, subject: string | null, goal: string | null ): void => {
    getDatabase().prepare( `INSERT INTO time_entries ( id, user_id, source, subject_id, goal_id,
      day, started_at, ended_at, seconds, note, created_at, updated_at )
      VALUES ( ?, ?, 'calendar', ?, ?, '2026-11-09', '2026-11-09T07:00:00.000Z',
        '2026-11-09T08:00:00.000Z', 3600, 'Gym', 'now', 'now' )` )
      .run( id, userId, subject, goal )
  }

  it( 'reads a calendar entry back, whether it names a subject or a goal', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Health' ).id,
      name: 'Fit',
      outcome: 'learning',
    } ).id

    insertCalendar( 'c1', subjectId, null )
    insertCalendar( 'c2', null, goal )

    expect( listTimeEntries( userId, '2026-11-09', '2026-11-09' ).map( ( e ) => e.source ) )
      .toEqual( [ 'calendar', 'calendar' ] )
    expect( findTimeEntry( userId, 'c2' ) ).toMatchObject( { source: 'calendar', goal_id: goal } )
  } )

  it( 'splits a goal\'s time with a calendar share', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Health' ).id,
      name: 'Fit',
      outcome: 'learning',
    } ).id

    insertCalendar( 'c2', null, goal )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-09', 60 ) )

    expect( timeByGoal( userId, '2026-11-09', '2026-11-09' )[ goal ] )
      .toEqual( { measured: 0, logged: 60, calendar: 3600 } )
  } )
} )

describe( 'timeByGoal', () => {
  const makeGoal = ( name: string ): string => insertGoal( userId, {
    area_id: insertArea( userId, `Area ${ name }` ).id,
    name,
    outcome: 'learning',
  } ).id

  it( 'adds a goal\'s own logged time to all the time of its linked subjects, by source', () => {
    const goal = makeGoal( 'A' )
    const other = makeGoal( 'B' )
    const second = addSubject( userId, 'Learning/Second' )
    const unlinked = addSubject( userId, 'Learning/Unlinked' )

    setSubjectsForGoal( userId, goal, [ subjectId, second ] )
    setSubjectsForGoal( userId, other, [] )
    insertMeasuredEntry( userId, subjectId, { ...session( 'a', 'a', '2026-11-10' ), seconds: 100 } )
    insertLoggedEntry( userId, logged( { subject_id: second }, '2026-11-10', 200 ) )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-11', 400 ) )
    insertLoggedEntry( userId, logged( { goal_id: other }, '2026-11-11', 800 ) )
    insertMeasuredEntry( userId, unlinked, { ...session( 'b', 'b', '2026-11-10' ), seconds: 1600 } )

    expect( timeByGoal( userId, '2026-11-09', '2026-11-15' ) ).toEqual( {
      [ goal ]: { measured: 100, logged: 600, calendar: 0 },
      [ other ]: { measured: 0, logged: 800, calendar: 0 },
    } )
  } )

  it( 'counts only the days given, inclusive, and the user\'s own', () => {
    const goal = makeGoal( 'A' )

    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-08', 1 ) )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-09', 10 ) )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-15', 100 ) )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-16', 1000 ) )

    expect( timeByGoal( userId, '2026-11-09', '2026-11-15' ) )
      .toEqual( { [ goal ]: { measured: 0, logged: 110, calendar: 0 } } )
    expect( timeByGoal( createTestUser().id, '2026-11-09', '2026-11-15' ) ).toEqual( {} )
  } )
} )

describe( 'goalTimeByDay', () => {
  it( 'gives a goal\'s time per day and source, linked subjects included', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Career' ).id,
      name: 'G',
      outcome: 'learning',
    } ).id

    setSubjectsForGoal( userId, goal, [ subjectId ] )
    insertMeasuredEntry( userId, subjectId, { ...session( 'a', 'a', '2026-11-10' ), seconds: 100 } )
    insertMeasuredEntry( userId, subjectId, { ...session( 'b', 'b', '2026-11-10' ), seconds: 50 } )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-10', 400 ) )
    insertLoggedEntry( userId, logged( { goal_id: goal }, '2026-11-12', 60 ) )

    expect( goalTimeByDay( userId, goal, '2026-11-01', '2026-11-30' ) ).toEqual( [
      { day: '2026-11-10', source: 'logged', seconds: 400 },
      { day: '2026-11-10', source: 'measured', seconds: 150 },
      { day: '2026-11-12', source: 'logged', seconds: 60 },
    ] )
  } )
} )

describe( 'measuredIntervals', () => {
  const WINDOW = { started_at: '2026-11-09T07:00:00.000Z', ended_at: '2026-11-09T08:00:00.000Z' }

  const makeGoal = ( user: string, name: string ): string => insertGoal( user, {
    area_id: insertArea( user, `Area ${ name }` ).id,
    name,
    outcome: 'learning',
  } ).id

  const measure = ( subject: string, start: string, end: string, user = userId ): void => {
    insertMeasuredEntry( user, subject, session( start, end, '2026-11-09' ) )
  }

  it( 'gives the subject\'s measured entries that touch the window', () => {
    measure( subjectId, '2026-11-09T06:30:00.000Z', '2026-11-09T07:10:00.000Z' )
    measure( subjectId, '2026-11-09T07:30:00.000Z', '2026-11-09T07:40:00.000Z' )
    measure( subjectId, '2026-11-09T05:00:00.000Z', '2026-11-09T06:00:00.000Z' )
    measure( subjectId, '2026-11-09T09:00:00.000Z', '2026-11-09T09:30:00.000Z' )

    expect( measuredIntervals( userId, { subject_id: subjectId }, WINDOW ) ).toEqual( [
      { started_at: '2026-11-09T06:30:00.000Z', ended_at: '2026-11-09T07:10:00.000Z' },
      { started_at: '2026-11-09T07:30:00.000Z', ended_at: '2026-11-09T07:40:00.000Z' },
    ] )
  } )

  it( 'gives the measured entries of every subject linked to a goal', () => {
    const goal = makeGoal( userId, 'Fit' )
    const second = addSubject( userId, 'Learning/Second' )
    const unlinked = addSubject( userId, 'Learning/Unlinked' )

    setSubjectsForGoal( userId, goal, [ subjectId, second ] )
    measure( subjectId, '2026-11-09T07:00:00.000Z', '2026-11-09T07:10:00.000Z' )
    measure( second, '2026-11-09T07:20:00.000Z', '2026-11-09T07:30:00.000Z' )
    measure( unlinked, '2026-11-09T07:40:00.000Z', '2026-11-09T07:50:00.000Z' )

    expect( measuredIntervals( userId, { goal_id: goal }, WINDOW ) ).toHaveLength( 2 )
  } )

  it( 'ignores logged and calendar entries and other users\' entries', () => {
    const other = createTestUser().id
    const theirs = addSubject( other )

    insertLoggedEntry( userId, logged( { subject_id: subjectId }, '2026-11-09', 60 ) )
    measure( theirs, '2026-11-09T07:00:00.000Z', '2026-11-09T07:10:00.000Z', other )

    expect( measuredIntervals( userId, { subject_id: subjectId }, WINDOW ) ).toEqual( [] )
    expect( measuredIntervals( userId, { subject_id: theirs }, WINDOW ) ).toEqual( [] )
  } )
} )

describe( 'calendar entries as editable time', () => {
  const entry = {
    day: '2026-11-09',
    started_at: '2026-11-09T07:00:00.000Z',
    ended_at: '2026-11-09T08:00:00.000Z',
    seconds: 3000,
    note: 'Gym',
  }

  it( 'inserts a calendar entry for a subject, and for a goal', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Health' ).id,
      name: 'Fit',
      outcome: 'learning',
    } ).id
    const first = insertCalendarEntry( userId, { ...entry, subject_id: subjectId, goal_id: null } )
    const second = insertCalendarEntry( userId, { ...entry, subject_id: null, goal_id: goal } )

    expect( first ).toMatchObject( { source: 'calendar', subject_id: subjectId, seconds: 3000 } )
    expect( second ).toMatchObject( { source: 'calendar', goal_id: goal, note: 'Gym' } )
  } )

  it( 'edits the day, seconds, note and target of a calendar entry', () => {
    const goal = insertGoal( userId, {
      area_id: insertArea( userId, 'Health' ).id,
      name: 'Fit',
      outcome: 'learning',
    } ).id
    const { id } = insertCalendarEntry( userId, { ...entry, subject_id: subjectId, goal_id: null } )

    expect( updateCalendarEntry( userId, id, {
      day: '2026-11-08',
      seconds: 600,
      note: null,
      subject_id: null,
      goal_id: goal,
    } ) ).toMatchObject( {
      day: '2026-11-08',
      seconds: 600,
      note: null,
      goal_id: goal,
      subject_id: null,
    } )
  } )

  it( 'leaves logged and measured entries to their own functions', () => {
    const loggedId = insertLoggedEntry(
      userId,
      logged( { subject_id: subjectId }, '2026-11-09', 60 ),
    ).id
    const measuredId = insertMeasuredEntry( userId, subjectId, session( 'a', 'b' ) )

    expect( updateCalendarEntry( userId, loggedId, { seconds: 5 } ) ).toBeUndefined()
    expect( deleteCalendarEntry( userId, loggedId ) ).toBe( false )
    expect( deleteCalendarEntry( userId, measuredId ) ).toBe( false )
    expect( updateLoggedEntry( userId, loggedId, { seconds: 90 } )?.seconds ).toBe( 90 )
  } )

  it( 'deletes a calendar entry, and only the user\'s own', () => {
    const { id } = insertCalendarEntry( userId, { ...entry, subject_id: subjectId, goal_id: null } )

    expect( deleteCalendarEntry( createTestUser().id, id ) ).toBe( false )
    expect( deleteCalendarEntry( userId, id ) ).toBe( true )
    expect( findTimeEntry( userId, id ) ).toBeUndefined()
  } )
} )
