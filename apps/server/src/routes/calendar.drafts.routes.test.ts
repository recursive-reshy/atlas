// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Shared
import {
  ApproveCalendarDraftResponse,
  ApproveMatchedResponse,
  CalendarDraftResponse,
  ListCalendarDraftsResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertMeasuredEntry } from '../repositories/timeEntries.repository.js'
import { insertArea } from '../repositories/themisAreas.repository.js'
import { insertGoal } from '../repositories/themisGoals.repository.js'
import { setSubjectsForGoal } from '../repositories/meleteSubjects.repository.js'
// Themis
import { studyDay } from '../themis/periods.js'
// Test support
import {
  createTestUser,
  defaultTestAdmin,
  signedInRequest as request,
} from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

const HOUR = 3_600_000
const AT = '2026-11-10T09:00:00.000Z'

// Times are relative to now, so "in the past" holds on any day the tests run
const ago = ( hours: number ): string => new Date( Date.now() - hours * HOUR ).toISOString()

// Tests name drafts with short labels; each label is a fixed UUID on the wire
const labels = new Map< string, string >()

const idFor = ( label: string ): string => {
  const id = `00000000-0000-4000-8000-${ String( labels.size + 1 ).padStart( 12, '0' ) }`

  return [ ...labels.entries() ].find( ( [ , known ] ) => known === label )?.[ 0 ]
    ?? ( labels.set( id, label ), id )
}

const labelOf = ( id: string ): string => labels.get( id ) ?? id

let admin: TestUser
let subject = ''
let goal = ''

const goalOf = ( user: string, name = 'Fit' ): string => insertGoal( user, {
  area_id: insertArea( user, `Area ${ name }` ).id,
  name,
  outcome: 'learning',
} ).id

type DraftSeed = {
  user?: TestUser
  title?: string
  start?: string
  end?: string
  status?: string
  subject?: string | null
  goal?: string | null
  assignedBy?: string | null
  ruleId?: string | null
}

const addDraft = ( id: string, seed: DraftSeed = {} ): void => {
  const start = seed.start ?? ago( 4 )
  const end = seed.end ?? ago( 3 )

  getDatabase().prepare( `INSERT INTO calendar_events ( id, user_id, calendar_id, event_id, title,
    started_at, ended_at, day, seconds, status, subject_id, goal_id, assigned_by, rule_id,
    created_at, updated_at ) VALUES ( ?, ?, 'cal-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )` )
    .run(
      idFor( id ),
      ( seed.user ?? admin ).id,
      id,
      seed.title ?? 'Gym',
      start,
      end,
      studyDay( new Date( start ) ),
      Math.round( ( Date.parse( end ) - Date.parse( start ) ) / 1000 ),
      seed.status ?? 'draft',
      seed.subject ?? null,
      seed.goal ?? null,
      seed.assignedBy ?? null,
      seed.ruleId ?? null,
      AT,
      AT,
    )
}

const addRule = ( id: string, phrase: string ): void => {
  getDatabase().prepare( `INSERT INTO calendar_rules ( id, user_id, phrase, subject_id, goal_id,
    position, created_at, updated_at ) VALUES ( ?, ?, ?, ?, NULL, 0, ?, ? )` )
    .run( id, admin.id, phrase, subject, AT, AT )
}

const measure = ( subjectId: string, start: string, end: string, user = admin ): void => {
  insertMeasuredEntry( user.id, subjectId, {
    started_at: start,
    ended_at: end,
    day: studyDay( new Date( start ) ),
    seconds: Math.round( ( Date.parse( end ) - Date.parse( start ) ) / 1000 ),
  } )
}

const listed = async ( user = admin ) => ListCalendarDraftsResponse
  .parse( ( await request( app, user ).get( '/api/calendar/drafts' ) ).body ).drafts
  .map( ( draft ) => ( { ...draft, id: labelOf( draft.id ) } ) )

type Row = Record< string, string | number | null >

const rowOf = ( id: string ) => getDatabase().prepare( `SELECT status, time_entry_id, subject_id,
  goal_id, assigned_by, rule_id, seconds, day, started_at, ended_at, note
  FROM calendar_events WHERE id = ?` ).get( idFor( id ) ) as Row

const entries = () => getDatabase().prepare( `SELECT source, subject_id, goal_id, day, started_at,
  ended_at, seconds, note FROM time_entries WHERE source = 'calendar' ORDER BY id` ).all()

beforeEach( () => {
  labels.clear()
  admin = defaultTestAdmin()
  subject = addSubject( admin.id )
  goal = goalOf( admin.id )
} )

describe( 'GET /api/calendar/drafts', () => {
  it( 'lists the drafts newest first with their assignment and the rule\'s phrase', async () => {
    addRule( 'r1', 'gym' )
    addDraft( 'older', { start: ago( 30 ), end: ago( 29 ) } )
    addDraft( 'newer', { subject, assignedBy: 'rule', ruleId: 'r1' } )
    addDraft( 'approved', { status: 'approved' } )

    const drafts = await listed()

    expect( drafts.map( ( { id } ) => id ) ).toEqual( [ 'newer', 'older' ] )
    expect( drafts[ 0 ] ).toMatchObject( {
      title: 'Gym',
      subject_id: subject,
      assigned_by: 'rule',
      rule_phrase: 'gym',
      seconds: 3600,
      note: null,
    } )
    expect( drafts[ 1 ] ).toMatchObject( { assigned_by: null, rule_phrase: null } )
  } )

  it( 'shows how much measured time of the subject already covers a draft', async () => {
    addDraft( 'd', { subject, start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 4.2 ), ago( 3.6 ) )

    expect( ( await listed() )[ 0 ] )
      .toMatchObject( { seconds: 3600, overlap_seconds: 1440, counts_seconds: 2160 } )
  } )

  it( 'counts the measured time of every subject linked to a goal', async () => {
    const other = addSubject( admin.id, 'Learning/Other' )

    setSubjectsForGoal( admin.id, goal, [ subject, other ] )
    addDraft( 'd', { goal, start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 4 ), ago( 3.75 ) )
    measure( other, ago( 3.5 ), ago( 3.25 ) )

    expect( ( await listed() )[ 0 ] )
      .toMatchObject( { overlap_seconds: 1800, counts_seconds: 1800 } )
  } )

  it( 'subtracts overlapping measured entries only once', async () => {
    addDraft( 'd', { subject, start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 4 ), ago( 3.5 ) )
    measure( subject, ago( 3.75 ), ago( 3.25 ) )

    expect( ( await listed() )[ 0 ]?.overlap_seconds ).toBe( 2700 )
  } )

  it( 'has no overlap for an unassigned draft', async () => {
    addDraft( 'd' )
    measure( subject, ago( 4 ), ago( 3 ) )

    expect( ( await listed() )[ 0 ] ).toMatchObject( { overlap_seconds: 0, counts_seconds: 3600 } )
  } )

  it( 'shows only the user\'s drafts, and needs Themis', async () => {
    const other = createTestUser()

    addDraft( 'mine' )
    addDraft( 'theirs', { user: other } )

    expect( ( await listed() ).map( ( { id } ) => id ) ).toEqual( [ 'mine' ] )
    expect( ( await listed( other ) ).map( ( { id } ) => id ) ).toEqual( [ 'theirs' ] )

    const member = createTestUser( { modules: [ 'melete' ] } )

    expect( ( await request( app, member ).get( '/api/calendar/drafts' ) ).status ).toBe( 404 )
  } )
} )

describe( 'PATCH /api/calendar/drafts/:id', () => {
  const patch = ( id: string, body: unknown, user = admin ) => request( app, user )
    .patch( `/api/calendar/drafts/${ idFor( id ) }` ).send( body as object )

  it( 'assigns a subject by hand, replacing a rule\'s assignment', async () => {
    addRule( 'r1', 'gym' )
    addDraft( 'd', { goal, assignedBy: 'rule', ruleId: 'r1' } )

    const response = await patch( 'd', { subject_id: subject } )

    expect( response.status ).toBe( 200 )
    expect( CalendarDraftResponse.parse( response.body ).draft )
      .toMatchObject( {
        subject_id: subject,
        goal_id: null,
        assigned_by: 'hand',
        rule_phrase: null,
      } )
    expect( rowOf( 'd' ) ).toMatchObject( { assigned_by: 'hand', rule_id: null } )
  } )

  it( 'assigns a goal by hand', async () => {
    addDraft( 'd' )

    expect( CalendarDraftResponse.parse( ( await patch( 'd', { goal_id: goal } ) ).body ).draft )
      .toMatchObject( { goal_id: goal, subject_id: null, assigned_by: 'hand' } )
  } )

  it( 'is 404 for a target that is not the user\'s own, or needs a module they lack', async () => {
    const other = createTestUser()
    const member = createTestUser( { modules: [ 'themis' ] } )

    addDraft( 'd' )
    addDraft( 'm', { user: member } )

    expect( ( await patch( 'd', { goal_id: goalOf( other.id ) } ) ).status ).toBe( 404 )
    expect( ( await patch( 'd', { subject_id: addSubject( other.id ) } ) ).status ).toBe( 404 )
    expect( ( await patch( 'm', { subject_id: addSubject( member.id ) }, member ) ).status )
      .toBe( 404 )
    expect( rowOf( 'd' ) ).toMatchObject( { assigned_by: null } )
  } )

  it( 'changes the times, and the seconds and day follow', async () => {
    addDraft( 'd' )

    const start = ago( 10 )
    const end = ago( 8.5 )
    const response = await patch( 'd', { started_at: start, ended_at: end } )

    expect( response.status ).toBe( 200 )
    expect( CalendarDraftResponse.parse( response.body ).draft )
      .toMatchObject( { seconds: 5400, day: studyDay( new Date( start ) ), started_at: start } )
  } )

  it( 'moves one end of the draft against the other as stored', async () => {
    addDraft( 'd', { start: ago( 4 ), end: ago( 3 ) } )

    expect( ( await patch( 'd', { ended_at: ago( 2 ) } ) ).status ).toBe( 200 )
    expect( rowOf( 'd' ).seconds ).toBe( 7200 )
    expect( ( await patch( 'd', { started_at: ago( 1 ) } ) ).status ).toBe( 400 )
  } )

  it( 'refuses an end that is not after the start, and times in the future, with 400', async () => {
    addDraft( 'd' )

    const future = new Date( Date.now() + HOUR ).toISOString()

    for( const body of [
      { started_at: ago( 3 ), ended_at: ago( 3 ) },
      { started_at: ago( 3 ), ended_at: ago( 4 ) },
      { ended_at: future },
    ] ) {
      expect( ( await patch( 'd', body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }

    expect( rowOf( 'd' ).seconds ).toBe( 3600 )
  } )

  it( 'sets and clears the note, and leaves the assignment alone', async () => {
    addDraft( 'd', { goal, assignedBy: 'hand' } )

    expect( CalendarDraftResponse.parse( ( await patch( 'd', { note: 'Leg day' } ) ).body ).draft )
      .toMatchObject( { note: 'Leg day', goal_id: goal, assigned_by: 'hand' } )
    expect( CalendarDraftResponse.parse( ( await patch( 'd', { note: null } ) ).body ).draft.note )
      .toBeNull()
  } )

  it( 'refuses an empty body, two targets, the title and a bad id with 400', async () => {
    addDraft( 'd' )

    for( const body of [ {}, { goal_id: goal, subject_id: subject }, { title: 'Renamed' } ] ) {
      expect( ( await patch( 'd', body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }
  } )

  it( 'is 404 for an unknown, settled or another user\'s draft', async () => {
    const other = createTestUser()

    addDraft( 'd' )
    addDraft( 'done', { status: 'approved' } )

    expect( ( await patch( 'nope', { note: 'x' } ) ).status ).toBe( 404 )
    expect( ( await patch( 'done', { note: 'x' } ) ).status ).toBe( 404 )
    expect( ( await patch( 'd', { note: 'x' }, other ) ).status ).toBe( 404 )
  } )

  it( 'keeps a hand assignment when rules change afterwards', async () => {
    addDraft( 'd' )
    await patch( 'd', { goal_id: goal } )
    await request( app )
      .post( '/api/calendar/rules' )
      .send( { phrase: 'gym', subject_id: subject } )

    expect( rowOf( 'd' ) ).toMatchObject( { goal_id: goal, assigned_by: 'hand' } )
  } )
} )

describe( 'POST /api/calendar/drafts/:id/approve', () => {
  const approve = ( id: string, user = admin ) => request( app, user )
    .post( `/api/calendar/drafts/${ idFor( id ) }/approve` )

  it( 'is 409 without an assignment, and changes nothing', async () => {
    addDraft( 'd' )

    expect( ( await approve( 'd' ) ).status ).toBe( 409 )
    expect( rowOf( 'd' ).status ).toBe( 'draft' )
    expect( entries() ).toEqual( [] )
  } )

  it( 'records the event\'s time on the assigned subject and marks it approved', async () => {
    const start = ago( 4 )
    const end = ago( 3 )

    addDraft( 'd', { subject, start, end } )
    getDatabase().prepare( 'UPDATE calendar_events SET note = ?' ).run( 'Leg day' )

    const response = await approve( 'd' )
    const { time_entry_id, recorded_seconds } = ApproveCalendarDraftResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( recorded_seconds ).toBe( 3600 )
    expect( entries() ).toEqual( [ {
      source: 'calendar',
      subject_id: subject,
      goal_id: null,
      day: studyDay( new Date( start ) ),
      started_at: start,
      ended_at: end,
      seconds: 3600,
      note: 'Leg day',
    } ] )
    expect( rowOf( 'd' ) ).toMatchObject( { status: 'approved', time_entry_id } )
  } )

  it( 'records the time on a goal', async () => {
    addDraft( 'd', { goal } )
    await approve( 'd' )

    expect( entries() ).toMatchObject( [ { goal_id: goal, subject_id: null } ] )
  } )

  it( 'records only the seconds measured time has not covered', async () => {
    addDraft( 'd', { subject, start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 4 ), ago( 3.75 ) )

    const { recorded_seconds } = ApproveCalendarDraftResponse
      .parse( ( await approve( 'd' ) ).body )

    expect( recorded_seconds ).toBe( 2700 )
    expect( entries() ).toMatchObject( [ { seconds: 2700 } ] )
  } )

  it( 'records nothing when measured time covers the whole event, yet approves it', async () => {
    addDraft( 'd', { subject, start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 5 ), ago( 2 ) )

    expect( ApproveCalendarDraftResponse.parse( ( await approve( 'd' ) ).body ) )
      .toEqual( { time_entry_id: null, recorded_seconds: 0 } )
    expect( entries() ).toEqual( [] )
    expect( rowOf( 'd' ) ).toMatchObject( { status: 'approved', time_entry_id: null } )
  } )

  it( 'does not change the recorded time when more is measured later', async () => {
    addDraft( 'd', { subject, start: ago( 4 ), end: ago( 3 ) } )
    await approve( 'd' )
    measure( subject, ago( 4 ), ago( 3 ) )

    expect( entries() ).toMatchObject( [ { seconds: 3600 } ] )
  } )

  it( 'approves a draft once; the second try finds nothing to approve', async () => {
    addDraft( 'd', { subject } )
    await approve( 'd' )

    expect( ( await approve( 'd' ) ).status ).toBe( 404 )
    expect( entries() ).toHaveLength( 1 )
  } )

  it( 'is 404 for an unknown or another user\'s draft', async () => {
    const other = createTestUser()

    addDraft( 'd', { subject } )

    expect( ( await approve( 'nope' ) ).status ).toBe( 404 )
    expect( ( await approve( 'd', other ) ).status ).toBe( 404 )
    expect( entries() ).toEqual( [] )
  } )

  it( 'is 409 when the assigned subject or goal is gone', async () => {
    addDraft( 'd', { subject } )
    getDatabase().prepare( 'DELETE FROM melete_subjects WHERE id = ?' ).run( subject )

    expect( ( await approve( 'd' ) ).status ).toBe( 409 )
  } )
} )

describe( 'POST /api/calendar/drafts/approve-matched', () => {
  const approveMatched = ( user = admin ) => request( app, user )
    .post( '/api/calendar/drafts/approve-matched' )

  it( 'approves every rule-assigned draft and leaves the rest', async () => {
    addRule( 'r1', 'gym' )
    addDraft( 'rule-1', { subject, assignedBy: 'rule', ruleId: 'r1' } )
    addDraft( 'rule-2', { goal, assignedBy: 'rule', ruleId: 'r1', start: ago( 8 ), end: ago( 7 ) } )
    addDraft( 'hand', { subject, assignedBy: 'hand' } )
    addDraft( 'none' )

    const response = await approveMatched()

    expect( response.status ).toBe( 200 )
    expect( ApproveMatchedResponse.parse( response.body ) ).toEqual( { approved: 2 } )
    expect( rowOf( 'rule-1' ).status ).toBe( 'approved' )
    expect( rowOf( 'rule-2' ).status ).toBe( 'approved' )
    expect( rowOf( 'hand' ).status ).toBe( 'draft' )
    expect( rowOf( 'none' ).status ).toBe( 'draft' )
    expect( entries() ).toHaveLength( 2 )
  } )

  it( 'subtracts measured time from each draft', async () => {
    addRule( 'r1', 'gym' )
    addDraft( 'a', { subject, assignedBy: 'rule', ruleId: 'r1', start: ago( 4 ), end: ago( 3 ) } )
    measure( subject, ago( 4 ), ago( 3.5 ) )

    await approveMatched()

    expect( entries() ).toMatchObject( [ { seconds: 1800 } ] )
  } )

  it( 'approves none, and says so, when nothing is matched', async () => {
    addDraft( 'none' )

    expect( ApproveMatchedResponse.parse( ( await approveMatched() ).body ) )
      .toEqual( { approved: 0 } )
  } )

  it( 'approves only the user\'s own drafts', async () => {
    const other = createTestUser()

    addRule( 'r1', 'gym' )
    addDraft( 'theirs', { user: other, goal: goalOf( other.id ), assignedBy: 'rule' } )

    expect( ApproveMatchedResponse.parse( ( await approveMatched() ).body ).approved ).toBe( 0 )
    expect( rowOf( 'theirs' ).status ).toBe( 'draft' )
  } )
} )

describe( 'POST /api/calendar/drafts/:id/dismiss', () => {
  const dismiss = ( id: string, user = admin ) => request( app, user )
    .post( `/api/calendar/drafts/${ idFor( id ) }/dismiss` )

  it( 'dismisses a draft, assigned or not, recording no time', async () => {
    addDraft( 'a' )
    addDraft( 'b', { subject, assignedBy: 'hand' } )

    expect( ( await dismiss( 'a' ) ).status ).toBe( 204 )
    expect( ( await dismiss( 'b' ) ).status ).toBe( 204 )
    expect( rowOf( 'a' ).status ).toBe( 'dismissed' )
    expect( rowOf( 'b' ) ).toMatchObject( { status: 'dismissed', time_entry_id: null } )
    expect( entries() ).toEqual( [] )
    expect( await listed() ).toEqual( [] )
  } )

  it( 'is 404 for an unknown, settled or another user\'s draft', async () => {
    addDraft( 'done', { status: 'approved' } )
    addDraft( 'd' )

    expect( ( await dismiss( 'nope' ) ).status ).toBe( 404 )
    expect( ( await dismiss( 'done' ) ).status ).toBe( 404 )
    expect( ( await dismiss( 'd', createTestUser() ) ).status ).toBe( 404 )
    expect( rowOf( 'd' ).status ).toBe( 'draft' )
  } )
} )
