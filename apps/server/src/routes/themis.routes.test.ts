// Packages
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { ThemisAreaResponse, ThemisGoalResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Logger
import { logger } from '../logger.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

const admin = (): ReturnType< typeof signedInRequest > => signedInRequest( app, createTestUser( {
  role: 'admin',
} ) )

const makeArea = async (
  agent: ReturnType< typeof signedInRequest >,
  name: string,
): Promise< string > => {
  const response = await agent.post( '/api/themis/areas' ).send( { name } )

  return ThemisAreaResponse.parse( response.body ).area.id
}

const makeGoal = async (
  agent: ReturnType< typeof signedInRequest >,
  areaId: string,
  extra: Record< string, unknown > = { outcome: 'learning' },
  name = 'A goal',
): Promise< string > => {
  const response = await agent.post( '/api/themis/goals' )
    .send( { area_id: areaId, name, ...extra } )

  return ThemisGoalResponse.parse( response.body ).goal.id
}

const count = ( table: string ): number => {
  const row = getDatabase().prepare( `SELECT COUNT(*) AS count FROM ${ table }` )
    .get() as { count: number }

  return row.count
}

describe( 'the Themis module gate', () => {
  it( 'is a 404 for a user without Themis, and saves nothing', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } )
    const agent = signedInRequest( app, member )
    const unknownRoute = await agent.get( '/api/nowhere' )
    const response = await agent.post( '/api/themis/areas' ).send( { name: 'Career' } )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( unknownRoute.body )
    expect( count( 'themis_areas' ) ).toBe( 0 )
  } )

  it( 'opens to a member who has it, and to the admin', async () => {
    const member = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )

    expect( ( await member.post( '/api/themis/areas' ).send( { name: 'Career' } ) ).status )
      .toBe( 201 )
    expect( ( await admin().post( '/api/themis/areas' ).send( { name: 'Career' } ) ).status )
      .toBe( 201 )
  } )
} )

describe( 'POST /api/themis/areas', () => {
  it( 'creates an area at the end of the list', async () => {
    const agent = admin()

    const first = await agent.post( '/api/themis/areas' ).send( { name: ' Career ' } )
    const second = await agent.post( '/api/themis/areas' ).send( { name: 'Financial' } )

    expect( first.status ).toBe( 201 )
    expect( ThemisAreaResponse.parse( first.body ).area ).toMatchObject( {
      name: 'Career',
      position: 0,
    } )
    expect( ThemisAreaResponse.parse( second.body ).area.position ).toBe( 1 )
  } )

  it( 'refuses a blank name with 400 and a repeated name, ignoring case, with 409', async () => {
    const agent = admin()

    await makeArea( agent, 'Career' )

    expect( ( await agent.post( '/api/themis/areas' ).send( { name: '  ' } ) ).status ).toBe( 400 )
    expect( ( await agent.post( '/api/themis/areas' ).send( { name: 'CAREER' } ) ).status )
      .toBe( 409 )
    expect( count( 'themis_areas' ) ).toBe( 1 )
  } )
} )

describe( 'PATCH /api/themis/areas/:id', () => {
  it( 'renames an area', async () => {
    const agent = admin()
    const id = await makeArea( agent, 'Career' )

    const response = await agent.patch( `/api/themis/areas/${ id }` ).send( { name: 'Work' } )

    expect( response.status ).toBe( 200 )
    expect( ThemisAreaResponse.parse( response.body ).area.name ).toBe( 'Work' )
  } )

  it( 'refuses a name another area has with 409, but allows the area\'s own name', async () => {
    const agent = admin()
    const id = await makeArea( agent, 'Career' )

    await makeArea( agent, 'Financial' )

    expect( ( await agent.patch( `/api/themis/areas/${ id }` ).send( { name: 'financial' } ) )
      .status ).toBe( 409 )
    expect( ( await agent.patch( `/api/themis/areas/${ id }` ).send( { name: 'CAREER' } ) )
      .status ).toBe( 200 )
  } )

  it( 'moves an area to a new place and renumbers the others', async () => {
    const agent = admin()
    await makeArea( agent, 'A' )
    await makeArea( agent, 'B' )

    const c = await makeArea( agent, 'C' )
    const response = await agent.patch( `/api/themis/areas/${ c }` ).send( { position: 0 } )

    expect( ThemisAreaResponse.parse( response.body ).area.position ).toBe( 0 )

    const positions = getDatabase()
      .prepare( 'SELECT name, position FROM themis_areas ORDER BY position' ).all()

    expect( positions ).toEqual( [
      { name: 'C', position: 0 },
      { name: 'A', position: 1 },
      { name: 'B', position: 2 },
    ] )
  } )

  it( 'keeps a position past the end at the end', async () => {
    const agent = admin()
    const a = await makeArea( agent, 'A' )

    await makeArea( agent, 'B' )

    const response = await agent.patch( `/api/themis/areas/${ a }` ).send( { position: 99 } )

    expect( ThemisAreaResponse.parse( response.body ).area.position ).toBe( 1 )
  } )

  it( 'answers 404 for an unknown area and 400 for an empty body', async () => {
    const agent = admin()
    const id = await makeArea( agent, 'Career' )

    expect( ( await agent.patch( `/api/themis/areas/${ crypto.randomUUID() }` )
      .send( { name: 'X' } ) ).status ).toBe( 404 )
    expect( ( await agent.patch( `/api/themis/areas/${ id }` ).send( {} ) ).status ).toBe( 400 )
  } )
} )

describe( 'DELETE /api/themis/areas/:id', () => {
  it( 'deletes an empty area', async () => {
    const agent = admin()
    const id = await makeArea( agent, 'Career' )

    expect( ( await agent.delete( `/api/themis/areas/${ id }` ) ).status ).toBe( 204 )
    expect( count( 'themis_areas' ) ).toBe( 0 )
  } )

  it( 'refuses with 409 while the area has a goal of any status', async () => {
    const agent = admin()
    const id = await makeArea( agent, 'Career' )
    const goal = await makeGoal( agent, id )

    expect( ( await agent.delete( `/api/themis/areas/${ id }` ) ).status ).toBe( 409 )

    await agent.patch( `/api/themis/goals/${ goal }` ).send( { status: 'dropped' } )

    expect( ( await agent.delete( `/api/themis/areas/${ id }` ) ).status ).toBe( 409 )
    expect( count( 'themis_areas' ) ).toBe( 1 )

    await agent.delete( `/api/themis/goals/${ goal }` )

    expect( ( await agent.delete( `/api/themis/areas/${ id }` ) ).status ).toBe( 204 )
  } )

  it( 'answers 404 for an unknown area', async () => {
    expect( ( await admin().delete( `/api/themis/areas/${ crypto.randomUUID() }` ) ).status )
      .toBe( 404 )
  } )
} )

describe( 'POST /api/themis/goals', () => {
  it( 'creates a goal of each outcome type', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )

    const learning = await agent.post( '/api/themis/goals' )
      .send( { area_id: area, name: 'Move into data', outcome: 'learning' } )
    const metric = await agent.post( '/api/themis/goals' ).send( {
      area_id: area,
      name: 'Fund',
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
      target_date: '2027-06-30',
    } )
    const checkin = await agent.post( '/api/themis/goals' ).send( {
      area_id: area,
      name: 'Family',
      outcome: 'checkin',
      checkin_cadence: 'weekly',
    } )

    expect( learning.status ).toBe( 201 )
    expect( ThemisGoalResponse.parse( learning.body ).goal ).toMatchObject( {
      outcome: 'learning',
      status: 'active',
      position: 0,
    } )
    expect( ThemisGoalResponse.parse( metric.body ).goal ).toMatchObject( {
      outcome: 'metric',
      metric_target: 30000,
      target_date: '2027-06-30',
      position: 1,
    } )
    expect( ThemisGoalResponse.parse( checkin.body ).goal ).toMatchObject( {
      outcome: 'checkin',
      checkin_cadence: 'weekly',
    } )
  } )

  it( 'refuses a metric goal without a target and a goal without an outcome with 400', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )

    expect( ( await agent.post( '/api/themis/goals' )
      .send( { area_id: area, name: 'Fund', outcome: 'metric' } ) ).status ).toBe( 400 )
    expect( ( await agent.post( '/api/themis/goals' )
      .send( { area_id: area, name: 'Fund' } ) ).status ).toBe( 400 )
    expect( count( 'themis_goals' ) ).toBe( 0 )
  } )

  it( 'answers 404 for an area that does not exist', async () => {
    expect( ( await admin().post( '/api/themis/goals' )
      .send( { area_id: crypto.randomUUID(), name: 'X', outcome: 'learning' } ) ).status )
      .toBe( 404 )
  } )
} )

describe( 'PATCH /api/themis/goals/:id', () => {
  it( 'edits the name, target date and metric fields', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Financial' )
    const id = await makeGoal( agent, area, {
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
    } )

    const response = await agent.patch( `/api/themis/goals/${ id }` )
      .send( { name: 'Bigger fund', target_date: '2028-01-01', metric_target: 50000 } )

    expect( response.status ).toBe( 200 )
    expect( ThemisGoalResponse.parse( response.body ).goal ).toMatchObject( {
      name: 'Bigger fund',
      target_date: '2028-01-01',
      metric_target: 50000,
      metric_unit: 'SGD',
    } )
  } )

  it( 'refuses the outcome with 400, and fields of another outcome with 400', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )
    const id = await makeGoal( agent, area )

    expect( ( await agent.patch( `/api/themis/goals/${ id }` ).send( { outcome: 'metric' } ) )
      .status ).toBe( 400 )
    expect( ( await agent.patch( `/api/themis/goals/${ id }` ).send( { metric_target: 5 } ) )
      .status ).toBe( 400 )
    expect( ( await agent.patch( `/api/themis/goals/${ id }` )
      .send( { checkin_cadence: 'monthly' } ) ).status ).toBe( 400 )
  } )

  it( 'stamps status_changed_at on achieved or dropped and clears it on active', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )
    const id = await makeGoal( agent, area )

    const achieved = await agent.patch( `/api/themis/goals/${ id }` )
      .send( { status: 'achieved' } )

    expect( ThemisGoalResponse.parse( achieved.body ).goal ).toMatchObject( {
      status: 'achieved',
      status_changed_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )

    const again = await agent.patch( `/api/themis/goals/${ id }` ).send( { status: 'active' } )

    expect( ThemisGoalResponse.parse( again.body ).goal ).toMatchObject( {
      status: 'active',
      status_changed_at: null,
    } )
  } )

  it( 'does not restamp a status that did not change', async () => {
    vi.useFakeTimers()

    try {
      vi.setSystemTime( new Date( '2026-11-01T00:00:00.000Z' ) )

      const agent = admin()
      const area = await makeArea( agent, 'Career' )
      const id = await makeGoal( agent, area )

      await agent.patch( `/api/themis/goals/${ id }` ).send( { status: 'dropped' } )
      vi.setSystemTime( new Date( '2026-11-05T00:00:00.000Z' ) )

      const response = await agent.patch( `/api/themis/goals/${ id }` )
        .send( { status: 'dropped', name: 'Renamed' } )

      expect( ThemisGoalResponse.parse( response.body ).goal.status_changed_at )
        .toBe( '2026-11-01T00:00:00.000Z' )
    } finally {
      vi.useRealTimers()
    }
  } )

  it( 'moves a goal to another of the user\'s areas, at the end', async () => {
    const agent = admin()
    const from = await makeArea( agent, 'Career' )
    const to = await makeArea( agent, 'Financial' )
    const stay = await makeGoal( agent, from, { outcome: 'learning' }, 'Stay' )
    const move = await makeGoal( agent, from, { outcome: 'learning' }, 'Move' )

    await makeGoal( agent, to, { outcome: 'learning' }, 'There' )

    const response = await agent.patch( `/api/themis/goals/${ move }` ).send( { area_id: to } )

    expect( ThemisGoalResponse.parse( response.body ).goal ).toMatchObject( {
      area_id: to,
      position: 1,
    } )
    expect( getDatabase().prepare( 'SELECT id, area_id, position FROM themis_goals WHERE id = ?' )
      .get( stay ) ).toEqual( { id: stay, area_id: from, position: 0 } )
  } )

  it( 'reorders the goals of an area', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )

    await makeGoal( agent, area, { outcome: 'learning' }, 'A' )

    const b = await makeGoal( agent, area, { outcome: 'learning' }, 'B' )

    await agent.patch( `/api/themis/goals/${ b }` ).send( { position: 0 } )

    expect( getDatabase().prepare( 'SELECT name, position FROM themis_goals ORDER BY position' )
      .all() ).toEqual( [ { name: 'B', position: 0 }, { name: 'A', position: 1 } ] )
  } )

  it( 'answers 404 for an unknown goal or area and 400 for an empty body', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )
    const id = await makeGoal( agent, area )

    expect( ( await agent.patch( `/api/themis/goals/${ crypto.randomUUID() }` )
      .send( { name: 'X' } ) ).status ).toBe( 404 )
    expect( ( await agent.patch( `/api/themis/goals/${ id }` )
      .send( { area_id: crypto.randomUUID() } ) ).status ).toBe( 404 )
    expect( ( await agent.patch( `/api/themis/goals/${ id }` ).send( {} ) ).status ).toBe( 400 )
  } )
} )

describe( 'DELETE /api/themis/goals/:id', () => {
  it( 'deletes the goal with its updates, check-ins and logged time', async () => {
    const agent = admin()
    const area = await makeArea( agent, 'Career' )
    const id = await makeGoal( agent, area, { outcome: 'metric', metric_target: 10 } )
    const db = getDatabase()
    const owner = ( db.prepare( 'SELECT user_id FROM themis_goals WHERE id = ?' )
      .get( id ) as { user_id: string } ).user_id
    const now = '2026-11-07T00:00:00.000Z'

    db.prepare( `INSERT INTO themis_metric_updates ( user_id, goal_id, value, at )
      VALUES ( ?, ?, 1, ? )` ).run( owner, id, now )
    db.prepare( `INSERT INTO themis_checkins
      ( user_id, goal_id, period_start, rating, created_at )
      VALUES ( ?, ?, '2026-11-02', 3, ? )` ).run( owner, id, now )
    db.prepare( `INSERT INTO time_entries
      ( id, user_id, source, goal_id, day, seconds, created_at, updated_at )
      VALUES ( 't1', ?, 'logged', ?, '2026-11-07', 600, ?, ? )` ).run( owner, id, now, now )

    expect( ( await agent.delete( `/api/themis/goals/${ id }` ) ).status ).toBe( 204 )

    for( const table of [
      'themis_goals',
      'themis_metric_updates',
      'themis_checkins',
      'time_entries',
    ] ) {
      expect( count( table ), table ).toBe( 0 )
    }
  } )

  it( 'answers 404 for an unknown goal', async () => {
    expect( ( await admin().delete( `/api/themis/goals/${ crypto.randomUUID() }` ) ).status )
      .toBe( 404 )
  } )
} )

describe( 'logging (ADR 0049)', () => {
  it( 'never writes an area or goal name to the log', async () => {
    const spies = ( [ 'debug', 'info', 'warn', 'error' ] as const )
      .map( ( level ) => vi.spyOn( logger, level ) )
    const agent = admin()
    const area = await makeArea( agent, 'Secret area name' )

    await makeGoal( agent, area, { outcome: 'learning' }, 'Secret goal name' )
    await agent.patch( `/api/themis/areas/${ area }` ).send( { name: 'Secret renamed' } )
    await agent.post( '/api/themis/areas' ).send( { name: 'Secret renamed' } )

    const logged = JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) )

    expect( logged ).not.toContain( 'Secret' )
    spies.forEach( ( spy ) => spy.mockRestore() )
  } )
} )
