// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import {
  ConnectCalendarResponse,
  GetCalendarResponse,
  ListCalendarsResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Calendar
import {
  CalendarAuthError,
  MissingCalendarScopeError,
  MissingRefreshTokenError,
  OAuthStateError,
  completeConsent,
  createConsentUrl,
  disconnect,
  withCalendar,
} from '../calendar/auth.js'
// Repositories
import {
  findCalendarAccount,
  saveCalendarAccount,
  selectCalendar,
  setCalendarStatus,
} from '../repositories/calendarAccount.repository.js'
import { getDatabase } from '../repositories/database.js'
import { addDays, studyDay } from '../themis/periods.js'
// Logging
import { logger } from '../logger.js'
// Test support
import {
  createTestUser,
  defaultTestAdmin,
  signedInRequest as request,
} from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

vi.mock( '../calendar/auth.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '../calendar/auth.js' ) >(),
  createConsentUrl: vi.fn(),
  completeConsent: vi.fn(),
  disconnect: vi.fn(),
  withCalendar: vi.fn(),
} ) )

const configMock = vi.hoisted( () => ( {
  gmail: null as Record< string, unknown > | null,
  calendar: {
    redirectUri: null as string | null,
    lookbackDays: 14,
    apiBaseUrl: null as string | null,
  },
} ) )

vi.mock( '../config.js', async ( importOriginal ) => {
  const { config } = await importOriginal< typeof import( '../config.js' ) >()

  return { config: Object.assign( configMock, config, {
    gmail: configMock.gmail,
    calendar: configMock.calendar,
  } ) }
} )

const consentUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc'
const AT = '2026-11-10T09:00:00.000Z'
const today = (): string => studyDay( new Date() )

let userId = ''

const configured = (): void => {
  configMock.gmail = { clientId: 'id', clientSecret: 'secret' }
  configMock.calendar = {
    redirectUri: 'https://atlas.example/api/calendar/oauth/callback',
    lookbackDays: 14,
    apiBaseUrl: null,
  }
}

const connect = ( user = userId ): void => {
  saveCalendarAccount( user, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:ciphertext',
    scope: 'scopes',
    status: 'connected',
    error: null,
    connected_at: AT,
  } )
}

const choose = ( user = userId, id = 'cal-1' ): void => {
  selectCalendar( user, { id, name: 'Atlas' }, addDays( today(), -3 ) )
}

const insertEvent = (
  id: string,
  status: string,
  calendar = 'cal-1',
  entry: string | null = null,
) => {
  getDatabase().prepare( `INSERT INTO calendar_events ( id, user_id, calendar_id, event_id, title,
    started_at, ended_at, day, seconds, status, time_entry_id, created_at, updated_at )
    VALUES ( ?, ?, ?, ?, 'Gym', ?, ?, '2026-11-09', 3600, ?, ?, ?, ? )` )
    .run( id, userId, calendar, id, AT, AT, status, entry, AT, AT )
}

const eventIds = (): string[] => ( getDatabase()
  .prepare( 'SELECT id FROM calendar_events ORDER BY id' ).all() as { id: string }[] )
  .map( ( { id } ) => id )

beforeEach( () => {
  vi.resetAllMocks()
  userId = defaultTestAdmin().id
  configured()
} )

describe( 'GET /api/calendar', () => {
  it( 'is not_configured without the Google client or the redirect', async () => {
    configMock.calendar = { ...configMock.calendar, redirectUri: null }

    const response = await request( app ).get( '/api/calendar' )

    expect( response.status ).toBe( 200 )
    expect( GetCalendarResponse.parse( response.body ) ).toEqual( { status: 'not_configured' } )

    configured()
    configMock.gmail = null
    expect( ( await request( app ).get( '/api/calendar' ) ).body )
      .toEqual( { status: 'not_configured' } )
  } )

  it( 'is not_connected with no account', async () => {
    const response = await request( app ).get( '/api/calendar' )

    expect( GetCalendarResponse.parse( response.body ) ).toEqual( { status: 'not_connected' } )
  } )

  it( 'is connected with the address and no calendar chosen yet', async () => {
    connect()

    const response = await request( app ).get( '/api/calendar' )

    expect( GetCalendarResponse.parse( response.body ) )
      .toEqual( { status: 'connected', email: 'naresh@example.com' } )
  } )

  it( 'shows the chosen calendar, the import day and the last sync', async () => {
    connect()
    choose()
    getDatabase().prepare( 'UPDATE calendar_account SET last_synced_at = ?' ).run( AT )

    const response = await request( app ).get( '/api/calendar' )

    expect( GetCalendarResponse.parse( response.body ) ).toEqual( {
      status: 'connected',
      email: 'naresh@example.com',
      calendar: { id: 'cal-1', name: 'Atlas' },
      import_from: addDays( today(), -3 ),
      last_synced_at: AT,
    } )
  } )

  it( 'is broken with the reason', async () => {
    connect()
    setCalendarStatus( userId, 'broken', 'Google no longer accepts access' )

    const response = await request( app ).get( '/api/calendar' )

    expect( GetCalendarResponse.parse( response.body ) ).toMatchObject( {
      status: 'broken',
      error: 'Google no longer accepts access',
    } )
  } )

  it( 'never shows the token', async () => {
    connect()

    expect( JSON.stringify( ( await request( app ).get( '/api/calendar' ) ).body ) )
      .not.toContain( 'ciphertext' )
  } )

  it( 'is a 404 for a user without Themis', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } )

    expect( ( await request( app, member ).get( '/api/calendar' ) ).status ).toBe( 404 )
    expect( ( await request( app, member ).post( '/api/calendar/connect' ) ).status ).toBe( 404 )
  } )
} )

describe( 'POST /api/calendar/connect', () => {
  it( 'returns the consent URL', async () => {
    vi.mocked( createConsentUrl ).mockReturnValue( consentUrl )

    const response = await request( app ).post( '/api/calendar/connect' )

    expect( response.status ).toBe( 200 )
    expect( ConnectCalendarResponse.parse( response.body ) ).toEqual( { url: consentUrl } )
    expect( createConsentUrl ).toHaveBeenCalledWith( userId )
  } )

  it( 'is 409 when Calendar is not configured', async () => {
    configMock.calendar = { ...configMock.calendar, redirectUri: null }

    const response = await request( app ).post( '/api/calendar/connect' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Calendar isn\'t configured' } )
    expect( createConsentUrl ).not.toHaveBeenCalled()
  } )
} )

describe( 'GET /api/calendar/oauth/callback', () => {
  it( 'completes the consent and sends the person to choose a calendar', async () => {
    const response = await request( app )
      .get( '/api/calendar/oauth/callback?code=the-code&state=the-state' )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location ).toBe( '/settings/sources?calendar=choose' )
    expect( completeConsent )
      .toHaveBeenCalledWith( userId, { code: 'the-code', state: 'the-state' } )
  } )

  it.each( [
    [ 'a refused consent', '?error=access_denied&state=s', undefined, 'denied' ],
    [ 'another Google error', '?error=server_error&state=s', undefined, 'failed' ],
    [ 'an unknown state', '?code=c&state=s', new OAuthStateError(), 'state' ],
    [ 'a missing state', '?code=c', undefined, 'state' ],
    [ 'no refresh token', '?code=c&state=s', new MissingRefreshTokenError(), 'no_refresh_token' ],
    [ 'a missing scope', '?code=c&state=s', new MissingCalendarScopeError(), 'scope' ],
    [ 'any other failure', '?code=c&state=s', new Error( 'boom' ), 'failed' ],
    [ 'a missing code', '?state=s', undefined, 'failed' ],
  ] )( 'redirects with the reason for %s', async ( _name, query, failure, reason ) => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    if( failure !== undefined ) {
      vi.mocked( completeConsent ).mockRejectedValue( failure )
    }

    const response = await request( app ).get( `/api/calendar/oauth/callback${ query }` )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location )
      .toBe( `/settings/sources?calendar=error&reason=${ reason }` )
  } )

  it( 'never puts the code in the redirect', async () => {
    vi.mocked( completeConsent ).mockRejectedValue( new Error( 'bad code 4/secret-code' ) )
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    const response = await request( app )
      .get( '/api/calendar/oauth/callback?code=4/secret-code&state=s' )

    expect( response.headers.location ).not.toContain( 'secret-code' )
  } )
} )

describe( 'GET /api/calendar/calendars', () => {
  const listWith = ( pages: Record< string, unknown >[][] ): void => {
    const list = vi.fn()

    pages.forEach( ( items, index ) => list.mockResolvedValueOnce( { data: {
      items,
      nextPageToken: index < pages.length - 1 ? `page-${ index + 1 }` : undefined,
    } } ) )
    vi.mocked( withCalendar ).mockImplementation( ( _id, run ) => run( {
      calendarList: { list },
    } as never ) )
  }

  it( 'lists the calendars with their names, primary first, across pages', async () => {
    connect()
    listWith( [
      [ { id: 'cal-2', summary: 'Gym', summaryOverride: 'My gym' } ],
      [
        { id: 'me', summary: 'naresh@example.com', primary: true },
        { id: 'cal-3', summary: 'Atlas' },
      ],
    ] )

    const response = await request( app ).get( '/api/calendar/calendars' )

    expect( ListCalendarsResponse.parse( response.body ).calendars ).toEqual( [
      { id: 'me', name: 'naresh@example.com', primary: true },
      { id: 'cal-3', name: 'Atlas', primary: false },
      { id: 'cal-2', name: 'My gym', primary: false },
    ] )
  } )

  it( 'is 409 when Calendar is not connected, or Google refuses the access', async () => {
    expect( ( await request( app ).get( '/api/calendar/calendars' ) ).status ).toBe( 409 )

    connect()
    vi.mocked( withCalendar ).mockRejectedValue( new CalendarAuthError( 'Revoked' ) )

    const response = await request( app ).get( '/api/calendar/calendars' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Revoked' } )
  } )
} )

describe( 'PUT /api/calendar/selection', () => {
  const put = ( body: unknown ) => request( app )
    .put( '/api/calendar/selection' )
    .send( body as object )

  const listOne = (): void => {
    vi.mocked( withCalendar ).mockImplementation( ( _id, run ) => run( {
      calendarList: { get: () => Promise.resolve( { data: { id: 'cal-1', summary: 'Atlas' } } ) },
    } as never ) )
  }

  it( 'stores the calendar, its name and the day to import from', async () => {
    connect()
    listOne()

    const response = await put( { calendar_id: 'cal-1', import_from: addDays( today(), -2 ) } )

    expect( response.status ).toBe( 200 )
    expect( GetCalendarResponse.parse( response.body ) ).toMatchObject( {
      status: 'connected',
      calendar: { id: 'cal-1', name: 'Atlas' },
      import_from: addDays( today(), -2 ),
    } )
    expect( findCalendarAccount( userId ) ).toMatchObject( { calendar_id: 'cal-1' } )
  } )

  it( 'accepts today and exactly 365 days back', async () => {
    connect()
    listOne()

    expect( ( await put( { calendar_id: 'cal-1', import_from: today() } ) ).status ).toBe( 200 )
    const oldest = await put( { calendar_id: 'cal-1', import_from: addDays( today(), -365 ) } )

    expect( oldest.status ).toBe( 200 )
  } )

  it( 'refuses a day in the future, one over 365 days back, a bad day and extra keys', async () => {
    connect()
    listOne()

    for( const import_from of [ addDays( today(), 1 ), addDays( today(), -366 ), '2026-02-30' ] ) {
      const response = await put( { calendar_id: 'cal-1', import_from } )

      expect( response.status, import_from ).toBe( 400 )
    }

    expect( ( await put( { calendar_id: 'cal-1', import_from: today(), x: 1 } ) ).status )
      .toBe( 400 )
    expect( ( await put( { import_from: today() } ) ).status ).toBe( 400 )
    expect( findCalendarAccount( userId )?.calendar_id ).toBeNull()
  } )

  it( 'refuses a calendar the account does not have', async () => {
    connect()
    vi.mocked( withCalendar ).mockRejectedValue(
      Object.assign( new Error( 'Not Found' ), { code: 404 } ),
    )

    const response = await put( { calendar_id: 'nope', import_from: today() } )

    expect( response.status ).toBe( 404 )
    expect( findCalendarAccount( userId )?.calendar_id ).toBeNull()
  } )

  it( 'is 409 when Calendar is not connected', async () => {
    expect( ( await put( { calendar_id: 'cal-1', import_from: today() } ) ).status ).toBe( 409 )
  } )

  it( 'drops the old calendar\'s drafts and keeps its approved and dismissed events', async () => {
    connect()
    choose( userId, 'cal-old' )
    insertEvent( 'draft-old', 'draft', 'cal-old' )
    insertEvent( 'approved-old', 'approved', 'cal-old' )
    insertEvent( 'dismissed-old', 'dismissed', 'cal-old' )
    insertEvent( 'draft-new', 'draft', 'cal-1' )
    listOne()

    await put( { calendar_id: 'cal-1', import_from: today() } )

    expect( eventIds() ).toEqual( [ 'approved-old', 'dismissed-old', 'draft-new' ] )
  } )

  it( 'keeps the drafts when the same calendar is chosen again with a new day', async () => {
    connect()
    choose( userId, 'cal-1' )
    insertEvent( 'draft-1', 'draft', 'cal-1' )
    listOne()

    await put( { calendar_id: 'cal-1', import_from: today() } )

    expect( eventIds() ).toEqual( [ 'draft-1' ] )
  } )
} )

describe( 'DELETE /api/calendar', () => {
  const entry = ( id: string ): void => {
    getDatabase().prepare( `INSERT INTO time_entries ( id, user_id, source, subject_id, goal_id,
      day, started_at, ended_at, seconds, note, created_at, updated_at )
      VALUES ( ?, ?, 'calendar', ?, NULL, '2026-11-09', NULL, NULL, 3600, NULL, ?, ? )` )
      .run( id, userId, addSubject( userId ), AT, AT )
  }

  const entries = (): number => getDatabase().prepare( 'SELECT id FROM time_entries' ).all().length

  it( 'disconnects and keeps the imported time by default', async () => {
    connect()
    choose()
    entry( 'e1' )
    insertEvent( 'approved-1', 'approved', 'cal-1', 'e1' )

    const response = await request( app ).delete( '/api/calendar' )

    expect( response.status ).toBe( 204 )
    expect( disconnect ).toHaveBeenCalledWith( userId )
    expect( eventIds() ).toEqual( [ 'approved-1' ] )
    expect( entries() ).toBe( 1 )
  } )

  it( 'with remove_time=true also removes the calendar\'s events and calendar time', async () => {
    connect()
    choose()
    entry( 'e1' )
    insertEvent( 'approved-1', 'approved', 'cal-1', 'e1' )
    insertEvent( 'approved-other', 'approved', 'cal-2' )

    const response = await request( app ).delete( '/api/calendar?remove_time=true' )

    expect( response.status ).toBe( 204 )
    expect( eventIds() ).toEqual( [ 'approved-other' ] )
    expect( entries() ).toBe( 0 )
  } )

  it( 'refuses a remove_time that is not true or false', async () => {
    connect()

    const response = await request( app ).delete( '/api/calendar?remove_time=maybe' )

    expect( response.status ).toBe( 400 )
    expect( disconnect ).not.toHaveBeenCalled()
  } )

  it( 'is 409 when Calendar is not configured', async () => {
    configMock.calendar = { ...configMock.calendar, redirectUri: null }

    expect( ( await request( app ).delete( '/api/calendar' ) ).status ).toBe( 409 )
    expect( disconnect ).not.toHaveBeenCalled()
  } )
} )

describe( 'Calendar for two users', () => {
  it( 'shows each user only their own account', async () => {
    const other = createTestUser()

    connect()
    choose()

    expect( ( await request( app, other ).get( '/api/calendar' ) ).body )
      .toEqual( { status: 'not_connected' } )
  } )

  it( 'does not let one user\'s selection or disconnect touch the other\'s', async () => {
    const other = createTestUser()

    connect()
    choose()
    connect( other.id )
    choose( other.id, 'theirs' )
    vi.mocked( withCalendar ).mockImplementation( ( _id, run ) => run( {
      calendarList: { get: () => Promise.resolve( { data: { id: 'cal-9', summary: 'Mine' } } ) },
    } as never ) )

    await request( app ).put( '/api/calendar/selection' )
      .send( { calendar_id: 'cal-9', import_from: today() } )

    expect( findCalendarAccount( other.id )?.calendar_id ).toBe( 'theirs' )

    await request( app, other ).delete( '/api/calendar' )
    expect( disconnect ).toHaveBeenCalledWith( other.id )
    expect( disconnect ).not.toHaveBeenCalledWith( userId )
  } )
} )
