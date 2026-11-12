// Packages
import { describe, expect, it } from 'vitest'
// Local
import {
  EditTimeEntryBody,
  ListTimeEntriesQuery,
  ListTimeEntriesResponse,
  LogTimeBody,
  TimeEntry,
  UpdateTimeEntryBody,
} from './time.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const other = '4f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

const entry = {
  id,
  source: 'logged',
  subject_id: other,
  goal_id: null,
  day: '2026-11-07',
  seconds: 1800,
  note: null,
  created_at: '2026-11-07T00:00:00.000Z',
  updated_at: '2026-11-07T00:00:00.000Z',
}

describe( 'TimeEntry', () => {
  it( 'accepts a logged entry for a subject and a measured one', () => {
    expect( TimeEntry.parse( entry ) ).toEqual( entry )
    expect( TimeEntry.parse( { ...entry, source: 'measured' } ).source ).toBe( 'measured' )
  } )

  it( 'accepts a calendar entry for a subject or a goal (ADR 0108)', () => {
    expect( TimeEntry.parse( { ...entry, source: 'calendar' } ).source ).toBe( 'calendar' )
    expect( TimeEntry.parse( {
      ...entry,
      source: 'calendar',
      subject_id: null,
      goal_id: '61000000-0000-4000-8000-000000000002',
    } ).goal_id ).not.toBeNull()
  } )

  it( 'refuses an unknown source and no seconds', () => {
    expect( TimeEntry.safeParse( { ...entry, source: 'guess' } ).success ).toBe( false )
    expect( TimeEntry.safeParse( { ...entry, seconds: 0 } ).success ).toBe( false )
  } )

  it( 'lists entries', () => {
    expect( ListTimeEntriesResponse.parse( { entries: [ entry ] } ).entries ).toHaveLength( 1 )
  } )
} )

describe( 'LogTimeBody', () => {
  const base = { day: '2026-11-07', minutes: 45 }

  it( 'takes a subject or a goal, a day, minutes and an optional note', () => {
    expect( LogTimeBody.parse( { ...base, subject_id: id } ) )
      .toEqual( { ...base, subject_id: id } )
    expect( LogTimeBody.parse( { ...base, goal_id: id, note: ' read chapter 3 ' } ) )
      .toEqual( { ...base, goal_id: id, note: 'read chapter 3' } )
  } )

  it( 'needs exactly one target', () => {
    expect( LogTimeBody.safeParse( base ).success ).toBe( false )
    expect( LogTimeBody.safeParse( { ...base, subject_id: id, goal_id: other } ).success )
      .toBe( false )
  } )

  it( 'keeps minutes whole and between 1 and 1440', () => {
    for( const minutes of [ 0, -5, 1441, 2.5, '30' ] ) {
      const body = { ...base, minutes, subject_id: id }

      expect( LogTimeBody.safeParse( body ).success, `${ minutes }` ).toBe( false )
    }

    expect( LogTimeBody.safeParse( { ...base, minutes: 1, subject_id: id } ).success ).toBe( true )
    expect( LogTimeBody.safeParse( { ...base, minutes: 1440, subject_id: id } ).success )
      .toBe( true )
  } )

  it( 'needs a calendar day and a note of at most 500 characters', () => {
    expect( LogTimeBody.safeParse( { ...base, day: 'today', subject_id: id } ).success )
      .toBe( false )
    expect( LogTimeBody.safeParse( { ...base, subject_id: id, note: 'x'.repeat( 501 ) } ).success )
      .toBe( false )
    expect( LogTimeBody.safeParse( { ...base, subject_id: id, source: 'measured' } ).success )
      .toBe( false )
  } )
} )

describe( 'UpdateTimeEntryBody', () => {
  it( 'changes minutes, day or note, and can clear the note', () => {
    expect( UpdateTimeEntryBody.parse( { minutes: 20 } ) ).toEqual( { minutes: 20 } )
    expect( UpdateTimeEntryBody.parse( { day: '2026-11-06', note: null } ) )
      .toEqual( { day: '2026-11-06', note: null } )
  } )

  it( 'refuses an empty body, a new target and a bad number of minutes', () => {
    expect( UpdateTimeEntryBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateTimeEntryBody.safeParse( { goal_id: id } ).success ).toBe( false )
    expect( UpdateTimeEntryBody.safeParse( { minutes: 0 } ).success ).toBe( false )
    expect( UpdateTimeEntryBody.safeParse( { minutes: 1441 } ).success ).toBe( false )
  } )
} )

describe( 'ListTimeEntriesQuery', () => {
  it( 'needs both ends as calendar days', () => {
    expect( ListTimeEntriesQuery.parse( { from: '2026-11-01', to: '2026-11-07' } ) )
      .toEqual( { from: '2026-11-01', to: '2026-11-07' } )
    expect( ListTimeEntriesQuery.safeParse( { from: '2026-11-01' } ).success ).toBe( false )
    expect( ListTimeEntriesQuery.safeParse( { from: 'x', to: '2026-11-07' } ).success )
      .toBe( false )
    expect( ListTimeEntriesQuery.safeParse( { from: '2026-11-08', to: '2026-11-07' } ).success )
      .toBe( false )
  } )
} )

describe( 'EditTimeEntryBody', () => {
  it( 'takes what UpdateTimeEntryBody takes, and one new target', () => {
    expect( EditTimeEntryBody.parse( { minutes: 20, note: null } ) )
      .toEqual( { minutes: 20, note: null } )
    expect( EditTimeEntryBody.parse( { goal_id: id } ) ).toEqual( { goal_id: id } )
    expect( EditTimeEntryBody.parse( { subject_id: other, day: '2026-11-06' } ).subject_id )
      .toBe( other )
  } )

  it( 'refuses an empty body, two targets, a bad id, bad minutes and extra keys', () => {
    expect( EditTimeEntryBody.safeParse( {} ).success ).toBe( false )
    expect( EditTimeEntryBody.safeParse( { subject_id: id, goal_id: other } ).success )
      .toBe( false )
    expect( EditTimeEntryBody.safeParse( { goal_id: 'nope' } ).success ).toBe( false )
    expect( EditTimeEntryBody.safeParse( { minutes: 0 } ).success ).toBe( false )
    expect( EditTimeEntryBody.safeParse( { source: 'logged' } ).success ).toBe( false )
  } )
} )
