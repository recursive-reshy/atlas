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
import { insertMetricUpdate, listMetricUpdates } from './themisMetrics.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''
let goalId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
  goalId = insertGoal( userId, {
    area_id: insertArea( userId, 'Financial' ).id,
    name: 'Fund',
    outcome: 'metric',
    metric_target: 100,
  } ).id
} )

describe( 'insertMetricUpdate and listMetricUpdates', () => {
  it( 'stores an update and lists the latest first', () => {
    const first = insertMetricUpdate( userId, goalId, {
      value: 10,
      at: '2026-11-01T00:00:00.000Z',
    } )

    insertMetricUpdate( userId, goalId, {
      value: 20,
      note: 'bonus',
      at: '2026-11-05T00:00:00.000Z',
    } )

    expect( first ).toEqual( {
      id: expect.any( Number ) as number,
      value: 10,
      note: null,
      at: '2026-11-01T00:00:00.000Z',
    } )
    expect( listMetricUpdates( userId, goalId ) ).toEqual( [
      expect.objectContaining( { value: 20, note: 'bonus' } ),
      expect.objectContaining( { value: 10 } ),
    ] )
  } )

  it( 'breaks a tie on the same instant by the later insert', () => {
    const at = '2026-11-05T00:00:00.000Z'

    insertMetricUpdate( userId, goalId, { value: 1, at } )
    insertMetricUpdate( userId, goalId, { value: 2, at } )

    expect( listMetricUpdates( userId, goalId ).map( ( { value } ) => value ) ).toEqual( [ 2, 1 ] )
  } )

  it( 'keeps only the last N when asked', () => {
    for( let day = 1; day <= 10; day++ ) {
      insertMetricUpdate( userId, goalId, {
        value: day,
        at: `2026-11-${ 10 + day }T00:00:00.000Z`,
      } )
    }

    expect( listMetricUpdates( userId, goalId, 8 ).map( ( { value } ) => value ) )
      .toEqual( [ 10, 9, 8, 7, 6, 5, 4, 3 ] )
  } )

  it( 'shows another user nothing', () => {
    insertMetricUpdate( userId, goalId, { value: 10, at: '2026-11-01T00:00:00.000Z' } )

    expect( listMetricUpdates( createTestUser().id, goalId ) ).toEqual( [] )
  } )
} )
