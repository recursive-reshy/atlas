// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import {
  ThemisAreaResponse,
  ThemisCheckinResponse,
  ThemisGoalResponse,
  ThemisMetricUpdateResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

type Agent = ReturnType< typeof signedInRequest >

let agent: Agent
let area = ''

// A Wednesday; the study day starts at 04:00 in Asia/Singapore, so this is 2026-11-11
const WEDNESDAY = new Date( '2026-11-11T06:00:00.000Z' )

const makeGoal = async ( extra: Record< string, unknown > ): Promise< string > => {
  const response = await agent.post( '/api/themis/goals' )
    .send( { area_id: area, name: 'Goal', ...extra } )

  return ThemisGoalResponse.parse( response.body ).goal.id
}

const backdate = ( goalId: string, createdAt: string ): void => {
  getDatabase().prepare( 'UPDATE themis_goals SET created_at = ? WHERE id = ?' )
    .run( createdAt, goalId )
}

const count = ( table: string ): number => {
  const row = getDatabase().prepare( `SELECT COUNT(*) AS count FROM ${ table }` )
    .get() as { count: number }

  return row.count
}

beforeEach( async () => {
  vi.useFakeTimers( { toFake: [ 'Date' ] } )
  vi.setSystemTime( WEDNESDAY )
  agent = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )
  area = ThemisAreaResponse.parse(
    ( await agent.post( '/api/themis/areas' ).send( { name: 'Area' } ) ).body,
  ).area.id
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'POST /api/themis/goals/:id/metric', () => {
  it( 'records an update stamped now', async () => {
    const id = await makeGoal( { outcome: 'metric', metric_unit: 'SGD', metric_target: 30000 } )

    const response = await agent.post( `/api/themis/goals/${ id }/metric` )
      .send( { value: 12500.5, note: 'January top-up' } )

    expect( response.status ).toBe( 201 )
    expect( ThemisMetricUpdateResponse.parse( response.body ).update ).toMatchObject( {
      value: 12500.5,
      note: 'January top-up',
      at: '2026-11-11T06:00:00.000Z',
    } )
    expect( count( 'themis_metric_updates' ) ).toBe( 1 )
  } )

  it( 'refuses goals of another outcome with 409', async () => {
    const learning = await makeGoal( { outcome: 'learning' } )
    const checkin = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' } )

    expect( ( await agent.post( `/api/themis/goals/${ learning }/metric` ).send( { value: 1 } ) )
      .status ).toBe( 409 )
    expect( ( await agent.post( `/api/themis/goals/${ checkin }/metric` ).send( { value: 1 } ) )
      .status ).toBe( 409 )
    expect( count( 'themis_metric_updates' ) ).toBe( 0 )
  } )

  it( 'refuses a bad value or a long note with 400', async () => {
    const id = await makeGoal( { outcome: 'metric', metric_target: 10 } )
    const path = `/api/themis/goals/${ id }/metric`

    expect( ( await agent.post( path ).send( { value: 'lots' } ) ).status ).toBe( 400 )
    expect( ( await agent.post( path ).send( {} ) ).status ).toBe( 400 )
    expect( ( await agent.post( path ).send( { value: 1, note: 'x'.repeat( 501 ) } ) ).status )
      .toBe( 400 )
  } )

  it( 'answers 404 for another user\'s goal and for an unknown goal', async () => {
    const id = await makeGoal( { outcome: 'metric', metric_target: 10 } )
    const other = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )

    expect( ( await other.post( `/api/themis/goals/${ id }/metric` ).send( { value: 1 } ) ).status )
      .toBe( 404 )
    expect( ( await agent.post( `/api/themis/goals/${ crypto.randomUUID() }/metric` )
      .send( { value: 1 } ) ).status ).toBe( 404 )
    expect( count( 'themis_metric_updates' ) ).toBe( 0 )
  } )
} )

describe( 'POST /api/themis/goals/:id/checkins', () => {
  const answer = ( id: string, body: Record< string, unknown > ) => agent
    .post( `/api/themis/goals/${ id }/checkins` ).send( body )

  const weekly = async (): Promise< string > => {
    const id = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' } )

    backdate( id, '2026-10-01T00:00:00.000Z' )

    return id
  }

  it( 'records the check-in for the period just finished', async () => {
    const id = await weekly()

    const response = await answer( id, { period_start: '2026-11-02', rating: 4, note: 'good' } )

    expect( response.status ).toBe( 201 )
    expect( ThemisCheckinResponse.parse( response.body ).checkin ).toMatchObject( {
      period_start: '2026-11-02',
      rating: 4,
      note: 'good',
    } )
  } )

  it( 'refuses a second answer for the same period with 409', async () => {
    const id = await weekly()

    await answer( id, { period_start: '2026-11-02', rating: 4 } )

    expect( ( await answer( id, { period_start: '2026-11-02', rating: 2 } ) ).status ).toBe( 409 )
    expect( count( 'themis_checkins' ) ).toBe( 1 )
  } )

  it( 'refuses any period but the one due with 400', async () => {
    const id = await weekly()

    expect( ( await answer( id, { period_start: '2026-10-26', rating: 3 } ) ).status ).toBe( 400 )
    expect( ( await answer( id, { period_start: '2026-11-09', rating: 3 } ) ).status ).toBe( 400 )
    expect( ( await answer( id, { period_start: '2026-11-03', rating: 3 } ) ).status ).toBe( 400 )
    expect( count( 'themis_checkins' ) ).toBe( 0 )
  } )

  it( 'refuses a goal that is not active or was made after the period with 400', async () => {
    const dropped = await weekly()
    const fresh = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' } )

    await agent.patch( `/api/themis/goals/${ dropped }` ).send( { status: 'dropped' } )

    expect( ( await answer( dropped, { period_start: '2026-11-02', rating: 3 } ) ).status )
      .toBe( 400 )
    expect( ( await answer( fresh, { period_start: '2026-11-02', rating: 3 } ) ).status )
      .toBe( 400 )
  } )

  it( 'uses the month just finished for a monthly goal', async () => {
    const id = await makeGoal( { outcome: 'checkin', checkin_cadence: 'monthly' } )

    backdate( id, '2026-09-01T00:00:00.000Z' )

    expect( ( await answer( id, { period_start: '2026-11-01', rating: 3 } ) ).status ).toBe( 400 )
    expect( ( await answer( id, { period_start: '2026-10-01', rating: 3 } ) ).status ).toBe( 201 )
  } )

  it( 'moves on when the next week starts', async () => {
    const id = await weekly()

    vi.setSystemTime( new Date( '2026-11-16T06:00:00.000Z' ) )

    expect( ( await answer( id, { period_start: '2026-11-02', rating: 3 } ) ).status ).toBe( 400 )
    expect( ( await answer( id, { period_start: '2026-11-09', rating: 3 } ) ).status ).toBe( 201 )
  } )

  it( 'refuses goals of another outcome with 409, bad ratings with 400', async () => {
    const metric = await makeGoal( { outcome: 'metric', metric_target: 1 } )
    const id = await weekly()

    expect( ( await answer( metric, { period_start: '2026-11-02', rating: 3 } ) ).status )
      .toBe( 409 )
    expect( ( await answer( id, { period_start: '2026-11-02', rating: 0 } ) ).status ).toBe( 400 )
    expect( ( await answer( id, { period_start: '2026-11-02', rating: 6 } ) ).status ).toBe( 400 )
  } )

  it( 'answers 404 for another user\'s goal', async () => {
    const id = await weekly()
    const other = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )

    expect( ( await other.post( `/api/themis/goals/${ id }/checkins` )
      .send( { period_start: '2026-11-02', rating: 3 } ) ).status ).toBe( 404 )
  } )
} )
