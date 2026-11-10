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
import { SUBJECT_ID } from '../fixtures/themis.fixture'
import { logTime } from './timeEntries.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

const entry = {
  id: '7d000000-0000-4000-8000-000000000001',
  source: 'logged',
  subject_id: SUBJECT_ID,
  goal_id: null,
  day: '2026-11-08',
  seconds: 1800,
  note: null,
  created_at: '2026-11-08T08:00:00.000Z',
  updated_at: '2026-11-08T08:00:00.000Z',
}

describe( 'logTime', () => {
  it( 'posts the minutes against the target and returns the entry', async () => {
    const body = { subject_id: SUBJECT_ID, day: '2026-11-08', minutes: 30 }

    fetchMock.mockResolvedValue( new Response( JSON.stringify( { entry } ), { status: 201 } ) )

    await expect( logTime( body ) ).resolves.toEqual( entry )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( body ),
    } )
  } )

  it( 'throws the server\'s message when the day is not allowed', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { error: 'The day is in the future' } ), { status: 400 } ),
    )

    await expect( logTime( { subject_id: SUBJECT_ID, day: '2030-01-01', minutes: 5 } ) )
      .rejects.toThrow( 'The day is in the future' )
  } )
} )
