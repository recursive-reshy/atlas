// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteRule,
  findRule,
  insertRule,
  listRules,
  setRuleOrder,
  updateRule,
} from './calendarRules.repository.js'
import { getDatabase } from './database.js'
import { insertArea } from './themisAreas.repository.js'
import { insertGoal } from './themisGoals.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''
let goalId = ''

const makeGoal = ( user: string, name: string ): string => insertGoal( user, {
  area_id: insertArea( user, `Area ${ name }` ).id,
  name,
  outcome: 'learning',
} ).id

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
  goalId = makeGoal( userId, 'Fit' )
} )

describe( 'insertRule', () => {
  it( 'appends the rule at the next position, for a goal or a subject', () => {
    const first = insertRule( userId, { phrase: 'Gym', subject_id: null, goal_id: goalId } )
    const second = insertRule( userId, { phrase: 'Read', subject_id: subjectId, goal_id: null } )

    expect( first )
      .toMatchObject( { phrase: 'Gym', goal_id: goalId, subject_id: null, position: 0 } )
    expect( second ).toMatchObject( { subject_id: subjectId, goal_id: null, position: 1 } )
  } )

  it( 'counts positions per user', () => {
    const other = createTestUser().id

    insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )

    expect( insertRule( other, { phrase: 'b', subject_id: null, goal_id: makeGoal( other, 'X' ) } )
      .position ).toBe( 0 )
  } )

  it( 'refuses a rule with no target or two', () => {
    expect( () => insertRule( userId, { phrase: 'a', subject_id: null, goal_id: null } ) )
      .toThrow( /CHECK/ )
    expect( () => insertRule( userId, { phrase: 'a', subject_id: subjectId, goal_id: goalId } ) )
      .toThrow( /CHECK/ )
  } )
} )

describe( 'listRules and findRule', () => {
  it( 'lists the user\'s rules by position and finds one by id', () => {
    const a = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )
    const b = insertRule( userId, { phrase: 'b', subject_id: null, goal_id: goalId } )

    setRuleOrder( userId, [ b.id, a.id ] )

    expect( listRules( userId ).map( ( { phrase } ) => phrase ) ).toEqual( [ 'b', 'a' ] )
    expect( findRule( userId, a.id )?.position ).toBe( 1 )
  } )

  it( 'shows nothing of another user', () => {
    const rule = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )
    const other = createTestUser().id

    expect( listRules( other ) ).toEqual( [] )
    expect( findRule( other, rule.id ) ).toBeUndefined()
  } )
} )

describe( 'updateRule', () => {
  it( 'changes the phrase and moves the target from a goal to a subject', () => {
    const rule = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )

    expect( updateRule( userId, rule.id, { phrase: 'b', subject_id: subjectId, goal_id: null } ) )
      .toMatchObject( { phrase: 'b', subject_id: subjectId, goal_id: null } )
  } )

  it( 'leaves what it is not given, and another user\'s rule alone', () => {
    const rule = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )

    expect( updateRule( userId, rule.id, { phrase: 'z' } ) )
      .toMatchObject( { phrase: 'z', goal_id: goalId } )
    expect( updateRule( createTestUser().id, rule.id, { phrase: 'hack' } ) ).toBeUndefined()
    expect( findRule( userId, rule.id )?.phrase ).toBe( 'z' )
  } )
} )

describe( 'setRuleOrder', () => {
  it( 'numbers the rules 0…n-1 in order and ignores ids that are not the user\'s', () => {
    const a = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )
    const b = insertRule( userId, { phrase: 'b', subject_id: null, goal_id: goalId } )
    const theirs = createTestUser().id
    const foreign = insertRule( theirs, {
      phrase: 'f',
      subject_id: null,
      goal_id: makeGoal( theirs, 'F' ),
    } )

    setRuleOrder( userId, [ b.id, foreign.id, a.id ] )

    expect( findRule( userId, b.id )?.position ).toBe( 0 )
    expect( findRule( userId, a.id )?.position ).toBe( 2 )
    expect( findRule( theirs, foreign.id )?.position ).toBe( 0 )
  } )
} )

describe( 'deleteRule', () => {
  it( 'deletes the rule and says whether it did', () => {
    const rule = insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )

    expect( deleteRule( createTestUser().id, rule.id ) ).toBe( false )
    expect( deleteRule( userId, rule.id ) ).toBe( true )
    expect( deleteRule( userId, rule.id ) ).toBe( false )
  } )

  it( 'goes with its goal, and with its subject', () => {
    insertRule( userId, { phrase: 'a', subject_id: null, goal_id: goalId } )
    insertRule( userId, { phrase: 'b', subject_id: subjectId, goal_id: null } )

    getDatabase().prepare( 'DELETE FROM themis_goals WHERE id = ?' ).run( goalId )
    expect( listRules( userId ).map( ( { phrase } ) => phrase ) ).toEqual( [ 'b' ] )

    getDatabase().prepare( 'DELETE FROM melete_subjects WHERE id = ?' ).run( subjectId )
    expect( listRules( userId ) ).toEqual( [] )
  } )
} )
