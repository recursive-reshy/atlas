// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteCalendarAccount,
  findCalendarAccount,
  markSynced,
  saveCalendarAccount,
  selectCalendar,
  setCalendarStatus,
} from './calendarAccount.repository.js'
import type { NewCalendarAccount } from './calendarAccount.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const account = ( overrides: Partial< NewCalendarAccount > = {} ): NewCalendarAccount => ( {
  email: 'naresh@example.com',
  refresh_token_enc: 'v1:aXY=:dGFn:Y2lwaGVy',
  scope: 'calendar.calendarlist.readonly calendar.events.readonly',
  status: 'connected',
  error: null,
  connected_at: '2026-11-10T09:00:00.000Z',
  ...overrides,
} )

describe( 'findCalendarAccount', () => {
  it( 'is undefined before anything is saved', () => {
    expect( findCalendarAccount( userId ) ).toBeUndefined()
  } )

  it( 'reads a saved account with no calendar chosen yet', () => {
    saveCalendarAccount( userId, account() )

    expect( findCalendarAccount( userId ) ).toEqual( {
      ...account(),
      calendar_id: null,
      calendar_name: null,
      import_from: null,
      last_synced_at: null,
    } )
  } )

  it( 'keeps each user\'s account apart', () => {
    saveCalendarAccount( userId, account() )

    expect( findCalendarAccount( createTestUser().id ) ).toBeUndefined()
  } )
} )

describe( 'saveCalendarAccount', () => {
  it( 'replaces the token and status on reconnect and keeps the chosen calendar', () => {
    saveCalendarAccount( userId, account() )
    selectCalendar( userId, { id: 'cal-1', name: 'Atlas' }, '2026-11-09' )
    markSynced( userId, '2026-11-10T09:30:00.000Z' )
    setCalendarStatus( userId, 'broken', 'Revoked' )

    saveCalendarAccount( userId, account( { refresh_token_enc: 'new', connected_at: 'later' } ) )

    expect( findCalendarAccount( userId ) ).toMatchObject( {
      refresh_token_enc: 'new',
      status: 'connected',
      error: null,
      connected_at: 'later',
      calendar_id: 'cal-1',
      calendar_name: 'Atlas',
      import_from: '2026-11-09',
      last_synced_at: '2026-11-10T09:30:00.000Z',
    } )
  } )
} )

describe( 'selectCalendar', () => {
  it( 'stores the calendar and the day to import from, and clears the last sync', () => {
    saveCalendarAccount( userId, account() )
    markSynced( userId, '2026-11-10T09:30:00.000Z' )
    selectCalendar( userId, { id: 'cal-2', name: 'Gym' }, '2026-11-02' )

    expect( findCalendarAccount( userId ) ).toMatchObject( {
      calendar_id: 'cal-2',
      calendar_name: 'Gym',
      import_from: '2026-11-02',
      last_synced_at: null,
    } )
  } )
} )

describe( 'setCalendarStatus', () => {
  it( 'marks the account broken with a reason, and connected again', () => {
    saveCalendarAccount( userId, account() )
    setCalendarStatus( userId, 'broken', 'Google refused' )

    expect( findCalendarAccount( userId ) )
      .toMatchObject( { status: 'broken', error: 'Google refused' } )

    setCalendarStatus( userId, 'connected', null )
    expect( findCalendarAccount( userId ) ).toMatchObject( { status: 'connected', error: null } )
  } )
} )

describe( 'deleteCalendarAccount', () => {
  it( 'removes only that user\'s account', () => {
    const other = createTestUser().id

    saveCalendarAccount( userId, account() )
    saveCalendarAccount( other, account( { email: 'other@example.com' } ) )
    deleteCalendarAccount( userId )

    expect( findCalendarAccount( userId ) ).toBeUndefined()
    expect( findCalendarAccount( other )?.email ).toBe( 'other@example.com' )
  } )
} )
