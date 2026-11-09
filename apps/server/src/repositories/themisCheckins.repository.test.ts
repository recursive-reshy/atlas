// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import { insertArea } from './themisAreas.repository.js'
import { insertGoal } from './themisGoals.repository.js'
import {
  insertCheckin,
  listCheckins,
  listPeriodStarts,
} from './themisCheckins.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''
let goalId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
  goalId = insertGoal( userId, {
    area_id: insertArea( userId, 'Family' ).id,
    name: 'Time together',
    outcome: 'checkin',
    checkin_cadence: 'weekly',
  } ).id
} )

describe( 'insertCheckin and listCheckins', () => {
  it( 'stores a check-in and lists the latest period first', () => {
    const first = insertCheckin( userId, goalId, { period_start: '2026-10-26', rating: 3 } )

    insertCheckin( userId, goalId, { period_start: '2026-11-02', rating: 5, note: 'great' } )

    expect( first ).toEqual( {
      id: expect.any( Number ) as number,
      period_start: '2026-10-26',
      rating: 3,
      note: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( listCheckins( userId, goalId ).map( ( { period_start: start } ) => start ) )
      .toEqual( [ '2026-11-02', '2026-10-26' ] )
  } )

  it( 'refuses a second check-in for a period', () => {
    insertCheckin( userId, goalId, { period_start: '2026-11-02', rating: 3 } )

    expect( () => insertCheckin( userId, goalId, { period_start: '2026-11-02', rating: 4 } ) )
      .toThrow( /UNIQUE/ )
  } )

  it( 'keeps only the last N when asked', () => {
    for( let week = 0; week < 10; week++ ) {
      insertCheckin( userId, goalId, {
        period_start: `2026-0${ 1 + Math.floor( week / 4 ) }-${ 10 + ( week % 4 ) * 7 }`,
        rating: 3,
      } )
    }

    expect( listCheckins( userId, goalId, 8 ) ).toHaveLength( 8 )
  } )

  it( 'shows another user nothing', () => {
    insertCheckin( userId, goalId, { period_start: '2026-11-02', rating: 3 } )

    expect( listCheckins( createTestUser().id, goalId ) ).toEqual( [] )
    expect( listPeriodStarts( createTestUser().id, goalId ) ).toEqual( [] )
  } )
} )

describe( 'listPeriodStarts', () => {
  it( 'lists every answered period', () => {
    insertCheckin( userId, goalId, { period_start: '2026-11-02', rating: 3 } )
    insertCheckin( userId, goalId, { period_start: '2026-10-26', rating: 2 } )

    expect( listPeriodStarts( userId, goalId ).sort() ).toEqual( [ '2026-10-26', '2026-11-02' ] )
  } )
} )
