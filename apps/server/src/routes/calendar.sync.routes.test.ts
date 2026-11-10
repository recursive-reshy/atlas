// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { SyncCalendarResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Calendar
import { listEvents } from '../calendar/calendar.client.js'
// Repositories
import {
  saveCalendarAccount,
  selectCalendar,
} from '../repositories/calendarAccount.repository.js'
// Test support
import {
  createTestUser,
  defaultTestAdmin,
  signedInRequest as request,
} from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'

vi.mock( '../calendar/calendar.client.js', () => ( { listEvents: vi.fn() } ) )

let admin: TestUser

const connect = ( user: TestUser = admin ): void => {
  saveCalendarAccount( user.id, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'scopes',
    status: 'connected',
    error: null,
    connected_at: '2026-11-10T09:00:00.000Z',
  } )
  selectCalendar( user.id, { id: 'cal-1', name: 'Atlas' }, '2020-01-01' )
}

const finishedEvent = () => {
  const end = new Date( Date.now() - 3_600_000 )

  return {
    event_id: 'a',
    title: 'Gym',
    started_at: new Date( end.getTime() - 3_600_000 ).toISOString(),
    ended_at: end.toISOString(),
  }
}

beforeEach( () => {
  vi.resetAllMocks()
  admin = defaultTestAdmin()
} )

describe( 'POST /api/calendar/sync', () => {
  it( 'syncs and returns the counts', async () => {
    connect()
    vi.mocked( listEvents ).mockResolvedValue( [ finishedEvent() ] )

    const response = await request( app ).post( '/api/calendar/sync' )

    expect( response.status ).toBe( 200 )
    expect( SyncCalendarResponse.parse( response.body ) )
      .toEqual( { added: 1, updated: 0, removed: 0, drafts: 1, skipped: false } )
  } )

  it( 'skips a sync younger than if_older_than, and syncs again without it', async () => {
    connect()
    vi.mocked( listEvents ).mockResolvedValue( [ finishedEvent() ] )
    await request( app ).post( '/api/calendar/sync' )

    const skipped = await request( app ).post( '/api/calendar/sync?if_older_than=300' )

    expect( SyncCalendarResponse.parse( skipped.body ) )
      .toEqual( { added: 0, updated: 0, removed: 0, drafts: 1, skipped: true } )
    expect( listEvents ).toHaveBeenCalledTimes( 1 )

    await request( app ).post( '/api/calendar/sync' )
    expect( listEvents ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'refuses an if_older_than that is not a whole number of seconds with 400', async () => {
    connect()

    for( const value of [ 'soon', '-1', '1.5', '86401' ] ) {
      const response = await request( app ).post( `/api/calendar/sync?if_older_than=${ value }` )

      expect( response.status, value ).toBe( 400 )
    }

    expect( listEvents ).not.toHaveBeenCalled()
  } )

  it( 'is 409 with no account', async () => {
    expect( ( await request( app ).post( '/api/calendar/sync' ) ).status ).toBe( 409 )
  } )

  it( 'is 502 when Google fails, with nothing about the events', async () => {
    connect()
    vi.mocked( listEvents ).mockRejectedValue( new Error( 'Backend Error: Therapy' ) )

    const response = await request( app ).post( '/api/calendar/sync' )

    expect( response.status ).toBe( 502 )
    expect( JSON.stringify( response.body ) ).not.toContain( 'Therapy' )
  } )

  it( 'is a 404 without Themis', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } )

    expect( ( await request( app, member ).post( '/api/calendar/sync' ) ).status ).toBe( 404 )
  } )

  it( 'syncs only the signed-in user\'s calendar', async () => {
    connect( createTestUser() )
    vi.mocked( listEvents ).mockResolvedValue( [ finishedEvent() ] )

    expect( ( await request( app ).post( '/api/calendar/sync' ) ).status ).toBe( 409 )
    expect( listEvents ).not.toHaveBeenCalled()
  } )
} )
