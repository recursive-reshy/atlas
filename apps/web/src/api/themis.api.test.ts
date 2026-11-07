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
import { overviewFixture, CHECKIN_GOAL_ID } from '../test-support/themis.fixture'
import { answerCheckin, createArea, getThemisOverview } from './themis.api'

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
