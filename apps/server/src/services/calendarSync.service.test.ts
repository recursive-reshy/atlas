// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Calendar
import { CalendarAuthError } from '../calendar/auth.js'
import { listEvents } from '../calendar/calendar.client.js'
import type { IncomingEvent } from '../calendar/reconcile.js'
// Errors
import { BadGatewayError, ConflictError } from '../errors.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import {
  findCalendarAccount,
  saveCalendarAccount,
  selectCalendar,
  setCalendarStatus,
} from '../repositories/calendarAccount.repository.js'
import { insertRule } from '../repositories/calendarRules.repository.js'
import { getDatabase } from '../repositories/database.js'
import { getHealth } from '../repositories/health.repository.js'
import { insertArea } from '../repositories/themisAreas.repository.js'
import { insertGoal } from '../repositories/themisGoals.repository.js'
// Services
import { syncCalendar } from './calendarSync.service.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

vi.mock( '../calendar/calendar.client.js', () => ( { listEvents: vi.fn() } ) )

// Singapore is UTC+8 and the study day starts at 04:00, so 2026-11-10T12:00Z is the 10th
const NOW = new Date( '2026-11-10T12:00:00.000Z' )
const AT = '2026-11-10T09:00:00.000Z'

let userId = ''

const event = ( id: string, overrides: Partial< IncomingEvent > = {} ): IncomingEvent => ( {
  event_id: id,
  title: 'Gym',
  started_at: '2026-11-09T07:00:00.000Z',
  ended_at: '2026-11-09T08:00:00.000Z',
  ...overrides,
} )

const connect = ( importFrom = '2026-10-01', user = userId ): void => {
  saveCalendarAccount( user, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'scopes',
    status: 'connected',
    error: null,
    connected_at: AT,
  } )
  selectCalendar( user, { id: 'cal-1', name: 'Atlas' }, importFrom )
}

const returns = ( ...events: IncomingEvent[] ): void => {
  vi.mocked( listEvents ).mockResolvedValue( events )
}

const rows = () => getDatabase().prepare( `SELECT event_id, title, status, day, seconds,
  subject_id, goal_id, assigned_by FROM calendar_events ORDER BY event_id` ).all()

const goalOf = (): string => insertGoal( userId, {
  area_id: insertArea( userId, 'Health' ).id,
  name: 'Fit',
  outcome: 'learning',
} ).id

beforeEach( () => {
  vi.resetAllMocks()
  userId = defaultTestAdmin().id
} )

describe( 'syncCalendar: preconditions', () => {
  it( 'is a conflict with no account, no chosen calendar or a broken connection', async () => {
    await expect( syncCalendar( userId, NOW ) ).rejects.toThrow( ConflictError )

    saveCalendarAccount( userId, {
      email: 'a@b.c',
      refresh_token_enc: 'x',
      scope: 's',
      status: 'connected',
      error: null,
      connected_at: AT,
    } )
    await expect( syncCalendar( userId, NOW ) ).rejects.toThrow( 'Choose a calendar' )

    connect()
    setCalendarStatus( userId, 'broken', 'Revoked' )
    vi.mocked( listEvents ).mockRejectedValue( new CalendarAuthError( 'Revoked' ) )
    await expect( syncCalendar( userId, NOW ) ).rejects.toThrow( ConflictError )
    expect( listEvents ).toHaveBeenCalledTimes( 1 )
  } )
} )

describe( 'syncCalendar: the window', () => {
  it( 'reads from the lookback when import_from is older, to now', async () => {
    connect( '2026-10-01' )
    returns()
    await syncCalendar( userId, NOW )

    expect( listEvents ).toHaveBeenCalledWith(
      userId,
      'cal-1',
      new Date( '2026-10-27T12:00:00.000Z' ),
      NOW,
    )
  } )

  it( 'reads from the start of the import_from study day when that is later', async () => {
    connect( '2026-11-08' )
    returns()
    await syncCalendar( userId, NOW )

    // 04:00 in Singapore on the 8th is 20:00Z on the 7th
    expect( vi.mocked( listEvents ).mock.calls[ 0 ]?.[ 2 ] )
      .toEqual( new Date( '2026-11-07T20:00:00.000Z' ) )
  } )
} )

describe( 'syncCalendar: reconciling', () => {
  it( 'adds a draft for an unknown event, with its day and seconds', async () => {
    connect()
    returns( event( 'a', {
      started_at: '2026-11-09T07:00:00.000Z',
      ended_at: '2026-11-09T08:30:00.000Z',
    } ) )

    expect( await syncCalendar( userId, NOW ) )
      .toEqual( { added: 1, updated: 0, removed: 0, drafts: 1, skipped: false } )
    expect( rows() ).toEqual( [ {
      event_id: 'a',
      title: 'Gym',
      status: 'draft',
      day: '2026-11-09',
      seconds: 5400,
      subject_id: null,
      goal_id: null,
      assigned_by: null,
    } ] )
  } )

  it( 'counts an event before the study day starts on the day before', async () => {
    connect()
    // 02:00 Singapore on the 10th is still the study day of the 9th
    returns( event( 'late', {
      started_at: '2026-11-09T18:00:00.000Z',
      ended_at: '2026-11-09T19:00:00.000Z',
    } ) )
    await syncCalendar( userId, NOW )

    expect( ( rows()[ 0 ] as { day: string } ).day ).toBe( '2026-11-09' )
  } )

  it( 'assigns a new draft by the first matching rule', async () => {
    const goal = goalOf()

    insertRule( userId, { phrase: 'gym', subject_id: null, goal_id: goal } )
    connect()
    returns( event( 'a' ), event( 'b', { title: 'Dentist' } ) )
    await syncCalendar( userId, NOW )

    expect( rows() ).toMatchObject( [
      { event_id: 'a', goal_id: goal, assigned_by: 'rule' },
      { event_id: 'b', goal_id: null, assigned_by: null },
    ] )
  } )

  it( 'updates a changed draft, re-applying rules when the title changed', async () => {
    const goal = goalOf()

    insertRule( userId, { phrase: 'gym', subject_id: null, goal_id: goal } )
    connect()
    returns( event( 'a' ) )
    await syncCalendar( userId, NOW )
    returns( event( 'a', { title: 'Dentist', ended_at: '2026-11-09T09:00:00.000Z' } ) )

    expect( await syncCalendar( userId, NOW ) )
      .toEqual( { added: 0, updated: 1, removed: 0, drafts: 1, skipped: false } )
    expect( rows() ).toMatchObject( [ {
      title: 'Dentist',
      seconds: 7200,
      goal_id: null,
      assigned_by: null,
    } ] )
  } )

  it( 'keeps a hand assignment when the title changes', async () => {
    const goal = goalOf()

    connect()
    returns( event( 'a' ) )
    await syncCalendar( userId, NOW )
    getDatabase().prepare( `UPDATE calendar_events SET goal_id = ?, assigned_by = 'hand'` )
      .run( goal )
    returns( event( 'a', { title: 'Renamed' } ) )
    await syncCalendar( userId, NOW )

    expect( rows() ).toMatchObject( [ { title: 'Renamed', goal_id: goal, assigned_by: 'hand' } ] )
  } )

  it( 'deletes a draft the calendar dropped, and keeps approved and dismissed rows', async () => {
    connect()
    returns( event( 'a' ), event( 'b' ), event( 'c' ) )
    await syncCalendar( userId, NOW )
    const settle = ( id: string, status: string ): void => {
      getDatabase().prepare( 'UPDATE calendar_events SET status = ? WHERE event_id = ?' )
        .run( status, id )
    }

    settle( 'b', 'approved' )
    settle( 'c', 'dismissed' )
    returns()

    expect( await syncCalendar( userId, NOW ) )
      .toEqual( { added: 0, updated: 0, removed: 1, drafts: 0, skipped: false } )
    expect( rows() ).toMatchObject( [
      { event_id: 'b', status: 'approved' },
      { event_id: 'c', status: 'dismissed' },
    ] )
  } )

  it( 'does not bring back an event that was approved or dismissed', async () => {
    connect()
    returns( event( 'a' ) )
    await syncCalendar( userId, NOW )
    getDatabase().prepare( 'UPDATE calendar_events SET status = \'dismissed\'' ).run()

    expect( await syncCalendar( userId, NOW ) )
      .toEqual( { added: 0, updated: 0, removed: 0, drafts: 0, skipped: false } )
    expect( rows() ).toHaveLength( 1 )
  } )

  it( 'skips events that have not ended', async () => {
    connect()
    returns( event( 'a', { ended_at: '2026-11-10T13:00:00.000Z' } ) )

    expect( ( await syncCalendar( userId, NOW ) ).added ).toBe( 0 )
  } )

  it( 'never touches another user\'s events', async () => {
    const other = createTestUser().id

    connect()
    connect( '2026-10-01', other )
    returns( event( 'a' ) )
    await syncCalendar( other, NOW )
    returns()
    await syncCalendar( userId, NOW )

    expect( rows() ).toHaveLength( 1 )
  } )

  it( 'stamps last_synced_at', async () => {
    connect()
    returns()
    await syncCalendar( userId, NOW )

    expect( findCalendarAccount( userId )?.last_synced_at ).toBe( NOW.toISOString() )
  } )
} )

describe( 'syncCalendar: failures and logs', () => {
  it( 'changes nothing and records a failed check when Google fails', async () => {
    connect()
    returns( event( 'a' ) )
    await syncCalendar( userId, NOW )
    vi.mocked( listEvents ).mockRejectedValue( new Error( 'Backend Error: Gym' ) )

    await expect( syncCalendar( userId, new Date( '2026-11-10T13:00:00.000Z' ) ) )
      .rejects.toThrow( BadGatewayError )

    expect( rows() ).toHaveLength( 1 )
    expect( findCalendarAccount( userId )?.last_synced_at ).toBe( NOW.toISOString() )
    expect( getHealth( userId, 'calendar_connection', userId )?.last_error )
      .toBe( 'Calendar sync failed' )
  } )

  it( 'never logs an event title', async () => {
    const spies = ( [ 'info', 'warn', 'error', 'debug' ] as const )
      .map( ( method ) => vi.spyOn( logger, method ).mockImplementation( () => undefined ) )

    connect()
    returns( event( 'a', { title: 'Therapy with Dr Secret' } ) )
    await syncCalendar( userId, NOW )
    returns( event( 'a', { title: 'Therapy with Dr Secret II' } ) )
    await syncCalendar( userId, NOW )
    vi.mocked( listEvents ).mockRejectedValue( new Error( 'x' ) )
    await syncCalendar( userId, NOW ).catch( () => undefined )

    expect( JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) ) ).not.toContain( 'Secret' )
  } )
} )

describe( 'syncCalendar: if_older_than', () => {
  it( 'skips a sync that is younger than the age and returns the current counts', async () => {
    connect()
    returns( event( 'a' ) )
    await syncCalendar( userId, NOW )

    const result = await syncCalendar( userId, new Date( NOW.getTime() + 60_000 ), 300 )

    expect( result ).toEqual( { added: 0, updated: 0, removed: 0, drafts: 1, skipped: true } )
    expect( listEvents ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'syncs when the last sync is older, or when there was none', async () => {
    connect()
    returns()
    await syncCalendar( userId, NOW, 300 )
    await syncCalendar( userId, new Date( NOW.getTime() + 301_000 ), 300 )

    expect( listEvents ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'syncs without the parameter whatever the last sync was', async () => {
    connect()
    returns()
    await syncCalendar( userId, NOW )
    await syncCalendar( userId, new Date( NOW.getTime() + 1000 ) )

    expect( listEvents ).toHaveBeenCalledTimes( 2 )
  } )
} )
