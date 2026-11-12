// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Shared
import { CalendarRuleResponse, ListCalendarRulesResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertArea } from '../repositories/themisAreas.repository.js'
import { insertGoal } from '../repositories/themisGoals.repository.js'
// Test support
import {
  createTestUser,
  defaultTestAdmin,
  signedInRequest as request,
} from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

const AT = '2026-11-10T09:00:00.000Z'

let admin: TestUser

const goalOf = ( user: string, name = 'Fit' ): string => insertGoal( user, {
  area_id: insertArea( user, `Area ${ name }` ).id,
  name,
  outcome: 'learning',
} ).id

const post = ( body: unknown, user = admin ) => request( app, user )
  .post( '/api/calendar/rules' ).send( body as object )

const rulesOf = async ( user = admin ) => ListCalendarRulesResponse
  .parse( ( await request( app, user ).get( '/api/calendar/rules' ) ).body ).rules

const addDraft = ( id: string, title: string, user = admin, assignedBy: string | null = null ) => {
  getDatabase().prepare( `INSERT INTO calendar_events ( id, user_id, calendar_id, event_id, title,
    started_at, ended_at, day, seconds, status, assigned_by, created_at, updated_at )
    VALUES ( ?, ?, 'cal-1', ?, ?, '2026-11-09T07:00:00.000Z', '2026-11-09T08:00:00.000Z',
      '2026-11-09', 3600, 'draft', ?, ?, ? )` ).run( id, user.id, id, title, assignedBy, AT, AT )
}

const eventOf = ( id: string ) => getDatabase()
  .prepare( 'SELECT subject_id, goal_id, assigned_by, rule_id FROM calendar_events WHERE id = ?' )
  .get( id )

beforeEach( () => {
  admin = defaultTestAdmin()
} )

describe( 'POST /api/calendar/rules', () => {
  it( 'creates a rule for a goal, appended last', async () => {
    const goal = goalOf( admin.id )
    const first = await post( { phrase: 'Gym', goal_id: goal } )
    const second = await post( { phrase: 'Run', goal_id: goal } )

    expect( first.status ).toBe( 201 )
    expect( CalendarRuleResponse.parse( first.body ).rule )
      .toMatchObject( { phrase: 'Gym', goal_id: goal, subject_id: null, position: 0 } )
    expect( CalendarRuleResponse.parse( second.body ).rule.position ).toBe( 1 )
  } )

  it( 'creates a rule for a subject', async () => {
    const subject = addSubject( admin.id )
    const response = await post( { phrase: 'Read', subject_id: subject } )

    expect( CalendarRuleResponse.parse( response.body ).rule.subject_id ).toBe( subject )
  } )

  it( 'refuses a bad body with 400', async () => {
    const goal = goalOf( admin.id )
    const subject = addSubject( admin.id )

    for( const body of [
      {},
      { phrase: 'Gym' },
      { goal_id: goal },
      { phrase: '', goal_id: goal },
      { phrase: 'x'.repeat( 101 ), goal_id: goal },
      { phrase: 'Gym', goal_id: goal, subject_id: subject },
      { phrase: 'Gym', goal_id: 'not-a-uuid' },
    ] ) {
      expect( ( await post( body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }
  } )

  it( 'is 404 for a goal or subject that is not the user\'s own', async () => {
    const other = createTestUser()

    expect( ( await post( { phrase: 'a', goal_id: goalOf( other.id ) } ) ).status ).toBe( 404 )
    expect( ( await post( { phrase: 'a', subject_id: addSubject( other.id ) } ) ).status )
      .toBe( 404 )
    expect( await rulesOf() ).toEqual( [] )
  } )

  it( 'needs Melete for a subject target, as if it did not exist', async () => {
    const member = createTestUser( { modules: [ 'themis' ] } )
    const subject = addSubject( member.id )

    expect( ( await post( { phrase: 'a', subject_id: subject }, member ) ).status ).toBe( 404 )
    expect( ( await post( { phrase: 'a', goal_id: goalOf( member.id ) }, member ) ).status )
      .toBe( 201 )
  } )

  it( 'is 404 without Themis', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } )

    expect( ( await post( { phrase: 'a', subject_id: addSubject( member.id ) }, member ) ).status )
      .toBe( 404 )
  } )

  it( 'assigns the user\'s unassigned drafts by the new rule, in the same request', async () => {
    const goal = goalOf( admin.id )

    addDraft( 'e1', 'Morning GYM' )
    addDraft( 'e2', 'Dentist' )

    const created = await post( { phrase: 'gym', goal_id: goal } )
    const ruleId = CalendarRuleResponse.parse( created.body ).rule.id

    expect( eventOf( 'e1' ) )
      .toEqual( { subject_id: null, goal_id: goal, assigned_by: 'rule', rule_id: ruleId } )
    expect( eventOf( 'e2' ) )
      .toEqual( { subject_id: null, goal_id: null, assigned_by: null, rule_id: null } )
  } )

  it( 'leaves another user\'s drafts alone', async () => {
    const other = createTestUser()

    addDraft( 'theirs', 'Gym', other )
    await post( { phrase: 'gym', goal_id: goalOf( admin.id ) } )

    expect( eventOf( 'theirs' ) ).toMatchObject( { assigned_by: null } )
  } )
} )

describe( 'GET /api/calendar/rules', () => {
  it( 'lists the user\'s rules by position, and only theirs', async () => {
    const goal = goalOf( admin.id )
    const other = createTestUser()

    await post( { phrase: 'b', goal_id: goal } )
    await post( { phrase: 'a', goal_id: goal } )
    await post( { phrase: 'x', goal_id: goalOf( other.id ) }, other )

    expect( ( await rulesOf() ).map( ( { phrase } ) => phrase ) ).toEqual( [ 'b', 'a' ] )
    expect( ( await rulesOf( other ) ).map( ( { phrase } ) => phrase ) ).toEqual( [ 'x' ] )
  } )
} )

describe( 'PATCH /api/calendar/rules/:id', () => {
  const create = async ( phrase: string, goal: string ): Promise< string > => {
    const created = await post( { phrase, goal_id: goal } )

    return CalendarRuleResponse.parse( created.body ).rule.id
  }

  const patch = ( id: string, body: unknown, user = admin ) => request( app, user )
    .patch( `/api/calendar/rules/${ id }` ).send( body as object )

  it( 'changes the phrase', async () => {
    const id = await create( 'gym', goalOf( admin.id ) )
    const response = await patch( id, { phrase: 'run' } )

    expect( response.status ).toBe( 200 )
    expect( CalendarRuleResponse.parse( response.body ).rule.phrase ).toBe( 'run' )
  } )

  it( 'moves the target from a goal to a subject', async () => {
    const id = await create( 'gym', goalOf( admin.id ) )
    const subject = addSubject( admin.id )
    const patched = await patch( id, { subject_id: subject } )
    const { rule } = CalendarRuleResponse.parse( patched.body )

    expect( rule ).toMatchObject( { subject_id: subject, goal_id: null } )
  } )

  it( 'moves the rule to a position, renumbering the others', async () => {
    const goal = goalOf( admin.id )
    const a = await create( 'a', goal )
    const b = await create( 'b', goal )
    const c = await create( 'c', goal )

    await patch( c, { position: 0 } )
    expect( ( await rulesOf() ).map( ( { id } ) => id ) ).toEqual( [ c, a, b ] )
    expect( ( await rulesOf() ).map( ( { position } ) => position ) ).toEqual( [ 0, 1, 2 ] )

    await patch( c, { position: 99 } )
    expect( ( await rulesOf() ).map( ( { id } ) => id ) ).toEqual( [ a, b, c ] )
  } )

  it( 'refuses an empty body, two targets and a negative position with 400', async () => {
    const goal = goalOf( admin.id )
    const id = await create( 'gym', goal )

    const both = { goal_id: goal, subject_id: addSubject( admin.id ) }

    for( const body of [ {}, both, { position: -1 } ] ) {
      expect( ( await patch( id, body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }
  } )

  it( 'is 404 for an unknown rule, another user\'s rule or another user\'s target', async () => {
    const other = createTestUser()
    const id = await create( 'gym', goalOf( admin.id ) )
    const theirs = await create( 'x', goalOf( admin.id, 'Other' ) )

    expect( ( await patch( crypto.randomUUID(), { phrase: 'z' } ) ).status ).toBe( 404 )
    expect( ( await patch( id, { phrase: 'z' }, other ) ).status ).toBe( 404 )
    expect( ( await patch( theirs, { goal_id: goalOf( other.id ) } ) ).status ).toBe( 404 )
    expect( ( await rulesOf() ).map( ( { phrase } ) => phrase ) ).toEqual( [ 'gym', 'x' ] )
  } )

  it( 'reapplies to drafts: rule-assigned ones follow, hand-assigned ones stay', async () => {
    const goal = goalOf( admin.id )
    const subject = addSubject( admin.id )
    const id = await create( 'gym', goal )

    addDraft( 'auto', 'Gym' )
    addDraft( 'hand', 'Gym' )
    await patch( id, { phrase: 'gym' } )
    getDatabase().prepare( `UPDATE calendar_events
      SET assigned_by = 'hand', subject_id = ?, goal_id = NULL, rule_id = NULL WHERE id = 'hand'` )
      .run( subject )

    await patch( id, { phrase: 'swim' } )

    expect( eventOf( 'auto' ) )
      .toEqual( { subject_id: null, goal_id: null, assigned_by: null, rule_id: null } )
    expect( eventOf( 'hand' ) )
      .toEqual( { subject_id: subject, goal_id: null, assigned_by: 'hand', rule_id: null } )

    await patch( id, { phrase: 'gym' } )
    expect( eventOf( 'auto' ) ).toMatchObject( { goal_id: goal, assigned_by: 'rule', rule_id: id } )
    expect( eventOf( 'hand' ) ).toMatchObject( { subject_id: subject, assigned_by: 'hand' } )
  } )

  it( 'reapplies after a reorder, so the first rule by position wins', async () => {
    const goalA = goalOf( admin.id, 'A' )
    const goalB = goalOf( admin.id, 'B' )
    const a = await create( 'gym', goalA )
    const b = await create( 'gym', goalB )

    addDraft( 'e1', 'Gym' )
    await patch( a, { phrase: 'gym' } )
    expect( eventOf( 'e1' ) ).toMatchObject( { goal_id: goalA } )

    await patch( b, { position: 0 } )
    expect( eventOf( 'e1' ) ).toMatchObject( { goal_id: goalB, rule_id: b } )
  } )
} )

describe( 'DELETE /api/calendar/rules/:id', () => {
  it( 'deletes the rule and unassigns the drafts it had assigned', async () => {
    const goal = goalOf( admin.id )
    const created = await post( { phrase: 'gym', goal_id: goal } )
    const id = CalendarRuleResponse.parse( created.body ).rule.id

    addDraft( 'e1', 'Gym' )
    await request( app ).patch( `/api/calendar/rules/${ id }` ).send( { phrase: 'gym' } )
    expect( eventOf( 'e1' ) ).toMatchObject( { assigned_by: 'rule' } )

    const response = await request( app ).delete( `/api/calendar/rules/${ id }` )

    expect( response.status ).toBe( 204 )
    expect( await rulesOf() ).toEqual( [] )
    expect( eventOf( 'e1' ) )
      .toEqual( { subject_id: null, goal_id: null, assigned_by: null, rule_id: null } )
  } )

  it( 'is 404 for an unknown rule or another user\'s', async () => {
    const other = createTestUser()
    const created = await post( { phrase: 'gym', goal_id: goalOf( admin.id ) } )
    const id = CalendarRuleResponse.parse( created.body ).rule.id

    const unknown = await request( app ).delete( `/api/calendar/rules/${ crypto.randomUUID() }` )

    expect( unknown.status ).toBe( 404 )
    expect( ( await request( app, other ).delete( `/api/calendar/rules/${ id }` ) ).status )
      .toBe( 404 )
    expect( await rulesOf() ).toHaveLength( 1 )
  } )

  it( 'is 400 for an id that is not a UUID', async () => {
    expect( ( await request( app ).delete( '/api/calendar/rules/nope' ) ).status ).toBe( 400 )
  } )
} )
