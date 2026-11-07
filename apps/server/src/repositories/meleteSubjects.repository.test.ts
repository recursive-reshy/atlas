// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  findSubject,
  listSubjects,
  listSubjectsForGoal,
  setSubjectsForGoal,
  updateSubject,
  upsertSubject,
} from './meleteSubjects.repository.js'
import { insertArea } from './themisAreas.repository.js'
import { insertGoal } from './themisGoals.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

describe( 'upsertSubject', () => {
  it( 'creates a subject with the defaults', () => {
    const subject = upsertSubject( userId, 'Learning/TypeScript' )

    expect( subject ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      folder: 'Learning/TypeScript',
      auto_enroll: false,
      new_per_day: 10,
      target_level: null,
      intent: null,
      syllabus_status: 'none',
      syllabus_error: null,
      goal_id: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
  } )

  it( 'returns the same subject for the same folder and keeps its settings', () => {
    const first = upsertSubject( userId, 'Learning/TypeScript' )

    updateSubject( userId, first.id, { auto_enroll: true, new_per_day: 3 } )

    const again = upsertSubject( userId, 'Learning/TypeScript' )

    expect( again.id ).toBe( first.id )
    expect( again ).toMatchObject( { auto_enroll: true, new_per_day: 3 } )
    expect( listSubjects( userId ) ).toHaveLength( 1 )
  } )

  it( 'gives different folders different subjects', () => {
    expect( upsertSubject( userId, 'Learning/A' ).id )
      .not.toBe( upsertSubject( userId, 'Learning/B' ).id )
  } )
} )

describe( 'listSubjects and findSubject', () => {
  it( 'lists nothing at first', () => {
    expect( listSubjects( userId ) ).toEqual( [] )
  } )

  it( 'lists subjects by folder, ignoring case', () => {
    upsertSubject( userId, 'Learning/beta' )
    upsertSubject( userId, 'Learning/Alpha' )
    upsertSubject( userId, 'Learning/Gamma' )

    expect( listSubjects( userId ).map( ( { folder } ) => folder ) )
      .toEqual( [ 'Learning/Alpha', 'Learning/beta', 'Learning/Gamma' ] )
  } )

  it( 'finds a subject by id and returns undefined for an unknown one', () => {
    const subject = upsertSubject( userId, 'Learning/A' )

    expect( findSubject( userId, subject.id ) ).toEqual( subject )
    expect( findSubject( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'updateSubject', () => {
  it( 'changes only the given fields and returns the subject', () => {
    const { id } = upsertSubject( userId, 'Learning/A' )

    expect( updateSubject( userId, id, { auto_enroll: true } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 10 } )
    expect( updateSubject( userId, id, { new_per_day: 0 } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 0 } )
    expect( updateSubject( userId, id, { auto_enroll: false } ) )
      .toMatchObject( { auto_enroll: false, new_per_day: 0 } )
  } )

  it( 'returns undefined for an unknown subject', () => {
    expect( updateSubject( userId, crypto.randomUUID(), { new_per_day: 5 } ) ).toBeUndefined()
  } )
} )

describe( 'ownership', () => {
  it( 'lets two users have a subject for the same folder', () => {
    const other = createTestUser().id

    const mine = upsertSubject( userId, 'Learning/TypeScript' )
    const theirs = upsertSubject( other, 'Learning/TypeScript' )

    expect( theirs.id ).not.toBe( mine.id )
    expect( upsertSubject( userId, 'Learning/TypeScript' ).id ).toBe( mine.id )
  } )

  it( 'does not show or change another user\'s subject', () => {
    const other = createTestUser().id
    const mine = upsertSubject( userId, 'Learning/TypeScript' )

    expect( findSubject( other, mine.id ) ).toBeUndefined()
    expect( listSubjects( other ) ).toEqual( [] )
    expect( updateSubject( other, mine.id, { new_per_day: 1, auto_enroll: true } ) ).toBeUndefined()
    expect( findSubject( userId, mine.id ) )
      .toMatchObject( { new_per_day: 10, auto_enroll: false } )
  } )
} )

describe( 'updateSubject, the syllabus fields', () => {
  it( 'sets and clears the target level and intent', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    expect( updateSubject( userId, id, { target_level: 'proficient', intent: 'Pass the exam' } ) )
      .toMatchObject( { target_level: 'proficient', intent: 'Pass the exam' } )
    expect( updateSubject( userId, id, { intent: null } ) )
      .toMatchObject( { target_level: 'proficient', intent: null } )
  } )

  it( 'sets the syllabus status with its error, and clears the error', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    expect( updateSubject( userId, id, { syllabus_status: 'failed', syllabus_error: 'Too long' } ) )
      .toMatchObject( { syllabus_status: 'failed', syllabus_error: 'Too long' } )
    expect( updateSubject( userId, id, { syllabus_status: 'drafting', syllabus_error: null } ) )
      .toMatchObject( { syllabus_status: 'drafting', syllabus_error: null } )
  } )

  it( 'leaves the syllabus fields alone when only enrolment changes', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    updateSubject( userId, id, { target_level: 'expert', syllabus_status: 'approved' } )

    expect( updateSubject( userId, id, { new_per_day: 2 } ) )
      .toMatchObject( { target_level: 'expert', syllabus_status: 'approved', new_per_day: 2 } )
  } )

  it( 'does not change another user\'s subject', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id

    expect( updateSubject( other, id, { target_level: 'expert' } ) ).toBeUndefined()
    expect( findSubject( userId, id )?.target_level ).toBeNull()
  } )
} )

const makeGoal = ( owner: string, name = 'Goal' ): string => insertGoal( owner, {
  area_id: insertArea( owner, `Area ${ name }` ).id,
  name,
  outcome: 'learning',
} ).id

describe( 'goal links', () => {
  it( 'links a subject to a goal through updateSubject and unlinks it with null', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )
    const goal = makeGoal( userId )

    expect( updateSubject( userId, id, { goal_id: goal } )?.goal_id ).toBe( goal )
    expect( updateSubject( userId, id, { new_per_day: 2 } )?.goal_id ).toBe( goal )
    expect( updateSubject( userId, id, { goal_id: null } )?.goal_id ).toBeNull()
  } )

  it( 'sets exactly the given subjects on a goal and unlinks the rest', () => {
    const a = upsertSubject( userId, 'Learning/A' ).id
    const b = upsertSubject( userId, 'Learning/B' ).id
    const c = upsertSubject( userId, 'Learning/C' ).id
    const goal = makeGoal( userId )
    const otherGoal = makeGoal( userId, 'Other' )

    setSubjectsForGoal( userId, otherGoal, [ c ] )
    setSubjectsForGoal( userId, goal, [ a, b ] )
    setSubjectsForGoal( userId, goal, [ b, c ] )

    expect( listSubjectsForGoal( userId, goal ).map( ( { id } ) => id ).sort() )
      .toEqual( [ b, c ].sort() )
    expect( findSubject( userId, a )?.goal_id ).toBeNull()
    expect( listSubjectsForGoal( userId, otherGoal ) ).toEqual( [] )
  } )

  it( 'unlinks every subject with an empty list', () => {
    const a = upsertSubject( userId, 'Learning/A' ).id
    const goal = makeGoal( userId )

    setSubjectsForGoal( userId, goal, [ a ] )
    setSubjectsForGoal( userId, goal, [] )

    expect( listSubjectsForGoal( userId, goal ) ).toEqual( [] )
  } )

  it( 'lists subjects by folder name and leaves another user\'s subjects alone', () => {
    const other = createTestUser( { role: 'member', modules: [ 'melete', 'themis' ] } ).id
    const theirs = upsertSubject( other, 'Learning/Theirs' ).id
    const mine = upsertSubject( userId, 'Learning/Zed' ).id
    const first = upsertSubject( userId, 'Learning/Alpha' ).id
    const goal = makeGoal( userId )

    setSubjectsForGoal( userId, goal, [ mine, first, theirs ] )

    expect( listSubjectsForGoal( userId, goal ).map( ( { folder } ) => folder ) )
      .toEqual( [ 'Learning/Alpha', 'Learning/Zed' ] )
    expect( findSubject( other, theirs )?.goal_id ).toBeNull()
    expect( listSubjectsForGoal( other, goal ) ).toEqual( [] )
  } )
} )
