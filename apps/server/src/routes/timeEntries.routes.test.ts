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
import { ListTimeEntriesResponse, TimeEntryResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertArea } from '../repositories/themisAreas.repository.js'
import { insertGoal } from '../repositories/themisGoals.repository.js'
import { insertMeasuredEntry } from '../repositories/timeEntries.repository.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

// A Wednesday; the study day starts at 04:00 in Asia/Singapore, so this is 2026-11-11
const WEDNESDAY = new Date( '2026-11-11T06:00:00.000Z' )
const TODAY = '2026-11-11'

let user: TestUser
let agent: ReturnType< typeof signedInRequest >
let subject = ''
let goal = ''

const makeGoal = ( owner: string ): string => insertGoal( owner, {
  area_id: insertArea( owner, 'Career' ).id,
  name: 'Goal',
  outcome: 'learning',
} ).id

const rowCount = (): number => ( getDatabase()
  .prepare( 'SELECT COUNT(*) AS count FROM time_entries' ).get() as { count: number } ).count

const log = ( body: Record< string, unknown > ) => agent.post( '/api/time-entries' ).send( body )

beforeEach( () => {
  vi.useFakeTimers( { toFake: [ 'Date' ] } )
  vi.setSystemTime( WEDNESDAY )
  user = createTestUser( { modules: [ 'melete', 'themis' ] } )
  agent = signedInRequest( app, user )
  subject = addSubject( user.id )
  goal = makeGoal( user.id )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'POST /api/time-entries', () => {
  it( 'logs minutes against a subject', async () => {
    const response = await log( {
      subject_id: subject,
      day: TODAY,
      minutes: 45,
      note: 'chapter 3',
    } )

    expect( response.status ).toBe( 201 )
    expect( TimeEntryResponse.parse( response.body ).entry ).toMatchObject( {
      source: 'logged',
      subject_id: subject,
      goal_id: null,
      day: TODAY,
      seconds: 2700,
      note: 'chapter 3',
    } )
  } )

  it( 'logs minutes against a goal, back-dated', async () => {
    const response = await log( { goal_id: goal, day: '2026-11-03', minutes: 90 } )

    expect( response.status ).toBe( 201 )
    expect( TimeEntryResponse.parse( response.body ).entry ).toMatchObject( {
      source: 'logged',
      subject_id: null,
      goal_id: goal,
      day: '2026-11-03',
      seconds: 5400,
      note: null,
    } )
  } )

  it( 'refuses both targets, no target and bad minutes with 400', async () => {
    const day = TODAY

    for( const body of [
      { day, minutes: 30 },
      { subject_id: subject, goal_id: goal, day, minutes: 30 },
      { subject_id: subject, day, minutes: 0 },
      { subject_id: subject, day, minutes: 1441 },
      { subject_id: subject, day, minutes: 1.5 },
      { subject_id: subject, day: 'today', minutes: 30 },
    ] ) {
      expect( ( await log( body ) ).status, JSON.stringify( body ) ).toBe( 400 )
    }

    expect( rowCount() ).toBe( 0 )
  } )

  it( 'accepts today and 365 days back, and refuses tomorrow and 366 days back', async () => {
    const entry = ( day: string ) => log( { subject_id: subject, day, minutes: 10 } )

    expect( ( await entry( TODAY ) ).status ).toBe( 201 )
    expect( ( await entry( '2025-11-11' ) ).status ).toBe( 201 )
    expect( ( await entry( '2026-11-12' ) ).status ).toBe( 400 )
    expect( ( await entry( '2025-11-10' ) ).status ).toBe( 400 )
  } )

  it( 'counts the day by the study day, not the calendar', async () => {
    // 03:00 in Singapore on 2026-11-12 is still the study day 2026-11-11
    vi.setSystemTime( new Date( '2026-11-11T19:00:00.000Z' ) )

    expect( ( await log( { subject_id: subject, day: '2026-11-11', minutes: 10 } ) ).status )
      .toBe( 201 )
    expect( ( await log( { subject_id: subject, day: '2026-11-12', minutes: 10 } ) ).status )
      .toBe( 400 )
  } )

  it( 'answers 404 for a subject or goal that is unknown or another user\'s', async () => {
    const other = createTestUser( { modules: [ 'melete', 'themis' ] } )
    const theirSubject = addSubject( other.id )
    const theirGoal = makeGoal( other.id )

    for( const target of [
      { subject_id: theirSubject },
      { goal_id: theirGoal },
      { subject_id: crypto.randomUUID() },
      { goal_id: crypto.randomUUID() },
    ] ) {
      expect( ( await log( { ...target, day: TODAY, minutes: 10 } ) ).status ).toBe( 404 )
    }

    expect( rowCount() ).toBe( 0 )
  } )

  it( 'needs Melete for a subject and Themis for a goal', async () => {
    const themisOnly = createTestUser( { modules: [ 'themis' ] } )
    const meleteOnly = createTestUser( { modules: [ 'melete' ] } )
    const body = ( target: Record< string, string > ) => ( { ...target, day: TODAY, minutes: 10 } )

    expect( ( await signedInRequest( app, themisOnly ).post( '/api/time-entries' )
      .send( body( { subject_id: addSubject( themisOnly.id ) } ) ) ).status ).toBe( 404 )
    expect( ( await signedInRequest( app, meleteOnly ).post( '/api/time-entries' )
      .send( body( { goal_id: makeGoal( meleteOnly.id ) } ) ) ).status ).toBe( 404 )
    expect( ( await signedInRequest( app, themisOnly ).post( '/api/time-entries' )
      .send( body( { goal_id: makeGoal( themisOnly.id ) } ) ) ).status ).toBe( 201 )
    expect( ( await signedInRequest( app, meleteOnly ).post( '/api/time-entries' )
      .send( body( { subject_id: addSubject( meleteOnly.id ) } ) ) ).status ).toBe( 201 )
  } )
} )

describe( 'PATCH and DELETE /api/time-entries/:id', () => {
  const logged = async (): Promise< string > => TimeEntryResponse.parse(
    ( await log( { subject_id: subject, day: TODAY, minutes: 30 } ) ).body,
  ).entry.id

  const measured = (): string => insertMeasuredEntry( user.id, subject, {
    started_at: '2026-11-11T05:00:00.000Z',
    ended_at: '2026-11-11T05:00:00.000Z',
    day: TODAY,
    seconds: 30,
  } )

  it( 'edits the minutes, day and note of a logged entry', async () => {
    const id = await logged()

    const response = await agent.patch( `/api/time-entries/${ id }` )
      .send( { minutes: 50, day: '2026-11-09', note: 'revised' } )

    expect( response.status ).toBe( 200 )
    expect( TimeEntryResponse.parse( response.body ).entry ).toMatchObject( {
      id,
      seconds: 3000,
      day: '2026-11-09',
      note: 'revised',
      subject_id: subject,
    } )

    const cleared = await agent.patch( `/api/time-entries/${ id }` ).send( { note: null } )

    expect( TimeEntryResponse.parse( cleared.body ).entry.note ).toBeNull()
  } )

  it( 'refuses a new target, a bad day or bad minutes with 400', async () => {
    const id = await logged()
    const patch = ( body: Record< string, unknown > ) => agent.patch( `/api/time-entries/${ id }` )
      .send( body )

    expect( ( await patch( { goal_id: goal } ) ).status ).toBe( 400 )
    expect( ( await patch( {} ) ).status ).toBe( 400 )
    expect( ( await patch( { minutes: 0 } ) ).status ).toBe( 400 )
    expect( ( await patch( { day: '2026-11-12' } ) ).status ).toBe( 400 )
    expect( ( await patch( { day: '2025-11-10' } ) ).status ).toBe( 400 )
  } )

  it( 'refuses to edit or delete a measured entry with 409', async () => {
    const id = measured()

    expect( ( await agent.patch( `/api/time-entries/${ id }` ).send( { minutes: 5 } ) ).status )
      .toBe( 409 )
    expect( ( await agent.delete( `/api/time-entries/${ id }` ) ).status ).toBe( 409 )
    expect( rowCount() ).toBe( 1 )
  } )

  it( 'deletes a logged entry', async () => {
    const id = await logged()

    expect( ( await agent.delete( `/api/time-entries/${ id }` ) ).status ).toBe( 204 )
    expect( rowCount() ).toBe( 0 )
  } )

  it( 'answers 404 for an unknown entry and for another user\'s', async () => {
    const id = await logged()
    const other = signedInRequest( app, createTestUser( { modules: [ 'melete', 'themis' ] } ) )

    expect( ( await other.patch( `/api/time-entries/${ id }` ).send( { minutes: 5 } ) ).status )
      .toBe( 404 )
    expect( ( await other.delete( `/api/time-entries/${ id }` ) ).status ).toBe( 404 )
    expect( ( await agent.delete( `/api/time-entries/${ crypto.randomUUID() }` ) ).status )
      .toBe( 404 )
    expect( rowCount() ).toBe( 1 )
  } )
} )

describe( 'GET /api/time-entries', () => {
  const list = ( query: string ) => agent.get( `/api/time-entries${ query }` )

  it( 'lists the entries on the days given, newest first', async () => {
    await log( { subject_id: subject, day: '2026-11-02', minutes: 10 } )
    await log( { goal_id: goal, day: '2026-11-08', minutes: 20 } )
    await log( { subject_id: subject, day: '2026-11-10', minutes: 30 } )

    const response = await list( '?from=2026-11-01&to=2026-11-09' )

    expect( response.status ).toBe( 200 )
    expect( ListTimeEntriesResponse.parse( response.body ).entries.map( ( { day } ) => day ) )
      .toEqual( [ '2026-11-08', '2026-11-02' ] )
  } )

  it( 'includes measured entries', async () => {
    insertMeasuredEntry( user.id, subject, {
      started_at: '2026-11-11T05:00:00.000Z',
      ended_at: '2026-11-11T05:00:00.000Z',
      day: TODAY,
      seconds: 30,
    } )

    expect( ListTimeEntriesResponse.parse( ( await list( `?from=${ TODAY }&to=${ TODAY }` ) ).body )
      .entries.map( ( { source } ) => source ) ).toEqual( [ 'measured' ] )
  } )

  it( 'refuses missing or bad days and a range that runs backwards with 400', async () => {
    for( const query of [
      '',
      '?from=2026-11-01',
      '?from=x&to=2026-11-02',
      '?from=2026-11-09&to=2026-11-01',
    ] ) {
      expect( ( await list( query ) ).status, query ).toBe( 400 )
    }
  } )

  it( 'shows each user only their own entries, whatever their modules', async () => {
    await log( { subject_id: subject, day: TODAY, minutes: 10 } )

    const nobody = signedInRequest( app, createTestUser( { modules: [] } ) )
    const response = await nobody.get( `/api/time-entries?from=${ TODAY }&to=${ TODAY }` )

    expect( response.status ).toBe( 200 )
    expect( ListTimeEntriesResponse.parse( response.body ).entries ).toEqual( [] )
  } )
} )
