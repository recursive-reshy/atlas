// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  CAREER_ID,
  CHECKIN_GOAL_ID,
  METRIC_GOAL_ID,
  SUBJECT_ID,
  metricCardFixture,
  overviewFixture,
} from '../test-support/themis.fixture'
import { goalDetailFixture, goalsListFixture } from '../test-support/themisGoal.fixture'
import {
  answerCheckin,
  createArea,
  createGoal,
  deleteArea,
  deleteGoal,
  getThemisGoal,
  getThemisGoals,
  getThemisOverview,
  logMetric,
  setGoalSubjects,
  updateArea,
  updateGoal,
} from './themis.api'

const fetchMock = vi.fn()

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'getThemisOverview', () => {
  it( 'reads the overview for a period', async () => {
    fetchMock.mockResolvedValue( json( overviewFixture( { period: 'month' } ) ) )

    await expect( getThemisOverview( 'month' ) )
      .resolves.toEqual( overviewFixture( { period: 'month' } ) )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/themis/overview?period=month', undefined )
  } )

  it( 'throws the server\'s message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Module not enabled' }, 404 ) )

    await expect( getThemisOverview( 'week' ) ).rejects.toThrow( 'Module not enabled' )
  } )
} )

describe( 'createArea', () => {
  it( 'posts the name and returns the area', async () => {
    const area = {
      id: '7a000000-0000-4000-8000-000000000009',
      name: 'Health',
      position: 0,
      created_at: 'x',
    }

    fetchMock.mockResolvedValue( json( { area }, 201 ) )

    await expect( createArea( { name: 'Health' } ) ).resolves.toEqual( area )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/themis/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { name: 'Health' } ),
    } )
  } )

  it( 'throws the server\'s message for a duplicate', async () => {
    fetchMock.mockResolvedValue( json( { error: 'That area already exists' }, 409 ) )

    await expect( createArea( { name: 'Health' } ) ).rejects.toThrow( 'That area already exists' )
  } )
} )

describe( 'answerCheckin', () => {
  it( 'posts the rating for the goal', async () => {
    const checkin = {
      id: 5,
      period_start: '2026-10-26',
      rating: 4,
      note: null,
      created_at: '2026-11-02T08:00:00.000Z',
    }

    fetchMock.mockResolvedValue( json( { checkin }, 201 ) )

    await expect( answerCheckin( CHECKIN_GOAL_ID, { period_start: '2026-10-26', rating: 4 } ) )
      .resolves.toEqual( checkin )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/goals/${ CHECKIN_GOAL_ID }/checkins`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify( { period_start: '2026-10-26', rating: 4 } ),
      },
    )
  } )
} )

const jsonCall = ( method: string, body: unknown ): RequestInit => ( {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify( body ),
} )

describe( 'updateArea and deleteArea', () => {
  it( 'renames an area', async () => {
    const area = { id: CAREER_ID, name: 'Work', position: 0, created_at: 'x' }

    fetchMock.mockResolvedValue( json( { area } ) )

    await expect( updateArea( CAREER_ID, { name: 'Work' } ) ).resolves.toEqual( area )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/areas/${ CAREER_ID }`,
      jsonCall( 'PATCH', { name: 'Work' } ),
    )
  } )

  it( 'deletes an area', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( deleteArea( CAREER_ID ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/areas/${ CAREER_ID }`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
  } )

  it( 'throws the server\'s message when the area still has goals', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Move or delete its goals first' }, 409 ) )

    await expect( deleteArea( CAREER_ID ) ).rejects.toThrow( 'Move or delete its goals first' )
  } )
} )

describe( 'goals', () => {
  it( 'lists every goal', async () => {
    fetchMock.mockResolvedValue( json( goalsListFixture() ) )

    await expect( getThemisGoals() ).resolves.toEqual( goalsListFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/themis/goals', undefined )
  } )

  it( 'reads one goal with its history', async () => {
    fetchMock.mockResolvedValue( json( goalDetailFixture() ) )

    await expect( getThemisGoal( METRIC_GOAL_ID ) ).resolves.toEqual( goalDetailFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( `/api/themis/goals/${ METRIC_GOAL_ID }`, undefined )
  } )

  it( 'creates a goal', async () => {
    const { goal } = metricCardFixture()
    const body = { area_id: CAREER_ID, name: 'Emergency fund', outcome: 'learning' } as const

    fetchMock.mockResolvedValue( json( { goal }, 201 ) )

    await expect( createGoal( body ) ).resolves.toEqual( goal )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/themis/goals', jsonCall( 'POST', body ) )
  } )

  it( 'changes a goal', async () => {
    const { goal } = metricCardFixture()

    fetchMock.mockResolvedValue( json( { goal } ) )

    await expect( updateGoal( METRIC_GOAL_ID, { status: 'achieved' } ) ).resolves.toEqual( goal )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/goals/${ METRIC_GOAL_ID }`,
      jsonCall( 'PATCH', { status: 'achieved' } ),
    )
  } )

  it( 'deletes a goal', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( deleteGoal( METRIC_GOAL_ID ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/goals/${ METRIC_GOAL_ID }`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
  } )

  it( 'records a metric value', async () => {
    const update = { id: 4, value: 15, note: null, at: '2026-11-08T08:00:00.000Z' }

    fetchMock.mockResolvedValue( json( { update }, 201 ) )

    await expect( logMetric( METRIC_GOAL_ID, { value: 15 } ) ).resolves.toEqual( update )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/goals/${ METRIC_GOAL_ID }/metric`,
      jsonCall( 'POST', { value: 15 } ),
    )
  } )

  it( 'sets the linked subjects', async () => {
    const subjects = [ { id: SUBJECT_ID, name: 'Data Engineering' } ]

    fetchMock.mockResolvedValue( json( { subjects } ) )

    await expect( setGoalSubjects( METRIC_GOAL_ID, [ SUBJECT_ID ] ) ).resolves.toEqual( subjects )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/themis/goals/${ METRIC_GOAL_ID }/subjects`,
      jsonCall( 'PUT', { subject_ids: [ SUBJECT_ID ] } ),
    )
  } )
} )
