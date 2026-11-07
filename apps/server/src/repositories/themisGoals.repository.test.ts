// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import { getDatabase } from './database.js'
import { insertArea } from './themisAreas.repository.js'
import {
  countGoalsInArea,
  deleteGoal,
  findGoal,
  insertGoal,
  listGoals,
  setGoalOrder,
  updateGoal,
} from './themisGoals.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''
let areaId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
  areaId = insertArea( userId, 'Career' ).id
} )

const learning = ( name: string, area = areaId ): Parameters< typeof insertGoal >[ 1 ] => ( {
  area_id: area,
  name,
  outcome: 'learning',
} )

describe( 'insertGoal and listGoals', () => {
  it( 'appends each goal at the next position within its area', () => {
    const other = insertArea( userId, 'Financial' ).id

    const first = insertGoal( userId, learning( 'First' ) )
    const second = insertGoal( userId, learning( 'Second' ) )
    const elsewhere = insertGoal( userId, learning( 'Elsewhere', other ) )

    expect( first ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      area_id: areaId,
      name: 'First',
      position: 0,
      target_date: null,
      status: 'active',
      status_changed_at: null,
      outcome: 'learning',
      metric_unit: null,
      metric_target: null,
      checkin_cadence: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( second.position ).toBe( 1 )
    expect( elsewhere.position ).toBe( 0 )
    expect( listGoals( userId ).map( ( { name } ) => name ) )
      .toEqual( [ 'First', 'Second', 'Elsewhere' ] )
  } )

  it( 'stores the fields of a metric goal and a check-in goal', () => {
    const metric = insertGoal( userId, {
      area_id: areaId,
      name: 'Fund',
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
      target_date: '2027-06-30',
    } )
    const checkin = insertGoal( userId, {
      area_id: areaId,
      name: 'Family',
      outcome: 'checkin',
      checkin_cadence: 'weekly',
    } )

    expect( metric ).toMatchObject( {
      metric_unit: 'SGD',
      metric_target: 30000,
      target_date: '2027-06-30',
    } )
    expect( checkin.checkin_cadence ).toBe( 'weekly' )
  } )

  it( 'lists only the user\'s goals', () => {
    insertGoal( userId, learning( 'Mine' ) )

    expect( listGoals( createTestUser().id ) ).toEqual( [] )
  } )
} )

describe( 'findGoal', () => {
  it( 'finds a goal for its owner only', () => {
    const goal = insertGoal( userId, learning( 'Mine' ) )

    expect( findGoal( userId, goal.id ) ).toEqual( goal )
    expect( findGoal( createTestUser().id, goal.id ) ).toBeUndefined()
  } )
} )

describe( 'updateGoal', () => {
  it( 'changes the given fields and nothing else', () => {
    const goal = insertGoal( userId, {
      area_id: areaId,
      name: 'Fund',
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
    } )

    expect( updateGoal( userId, goal.id, {
      name: 'Big fund',
      metric_target: 40000,
      target_date: '2027-12-31',
      status: 'achieved',
      status_changed_at: '2026-11-07T00:00:00.000Z',
    } ) ).toMatchObject( {
      name: 'Big fund',
      metric_unit: 'SGD',
      metric_target: 40000,
      target_date: '2027-12-31',
      status: 'achieved',
      status_changed_at: '2026-11-07T00:00:00.000Z',
    } )
  } )

  it( 'clears a target date and a unit with null', () => {
    const goal = insertGoal( userId, {
      area_id: areaId,
      name: 'Fund',
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 1,
      target_date: '2027-01-01',
    } )

    expect( updateGoal( userId, goal.id, { target_date: null, metric_unit: null } ) )
      .toMatchObject( { target_date: null, metric_unit: null } )
  } )

  it( 'moves a goal to another area', () => {
    const other = insertArea( userId, 'Financial' ).id
    const goal = insertGoal( userId, learning( 'Mine' ) )

    expect( updateGoal( userId, goal.id, { area_id: other, position: 3 } ) )
      .toMatchObject( { area_id: other, position: 3 } )
  } )

  it( 'leaves another user\'s goal alone', () => {
    const goal = insertGoal( userId, learning( 'Mine' ) )

    expect( updateGoal( createTestUser().id, goal.id, { name: 'Hacked' } ) ).toBeUndefined()
    expect( findGoal( userId, goal.id )?.name ).toBe( 'Mine' )
  } )
} )

describe( 'setGoalOrder', () => {
  it( 'renumbers the goals of an area in the order given', () => {
    const a = insertGoal( userId, learning( 'A' ) )
    const b = insertGoal( userId, learning( 'B' ) )

    setGoalOrder( userId, [ b.id, a.id ] )

    expect( listGoals( userId ).map( ( { name, position } ) => [ name, position ] ) )
      .toEqual( [ [ 'B', 0 ], [ 'A', 1 ] ] )
  } )
} )

describe( 'countGoalsInArea and deleteGoal', () => {
  it( 'counts goals of every status', () => {
    insertGoal( userId, learning( 'Active' ) )

    const dropped = insertGoal( userId, learning( 'Dropped' ) )

    updateGoal( userId, dropped.id, { status: 'dropped' } )

    expect( countGoalsInArea( userId, areaId ) ).toBe( 2 )
    expect( countGoalsInArea( createTestUser().id, areaId ) ).toBe( 0 )
  } )

  it( 'deletes a goal and the time logged against it', () => {
    const goal = insertGoal( userId, learning( 'Mine' ) )
    const db = getDatabase()
    const now = '2026-11-07T00:00:00.000Z'

    db.prepare( `INSERT INTO time_entries
      ( id, user_id, source, goal_id, day, seconds, created_at, updated_at )
      VALUES ( 't1', ?, 'logged', ?, '2026-11-07', 600, ?, ? )` )
      .run( userId, goal.id, now, now )

    expect( deleteGoal( createTestUser().id, goal.id ) ).toBe( false )
    expect( deleteGoal( userId, goal.id ) ).toBe( true )
    expect( findGoal( userId, goal.id ) ).toBeUndefined()
    expect( db.prepare( 'SELECT COUNT(*) AS count FROM time_entries' ).get() )
      .toEqual( { count: 0 } )
  } )
} )
