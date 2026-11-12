// Packages
import { describe, expect, it } from 'vitest'
// Local
import {
  ApproveCalendarDraftResponse,
  ApproveMatchedResponse,
  CalendarConnectionStatus,
  CalendarDraft,
  CalendarDraftResponse,
  CalendarRuleResponse,
  ConnectCalendarResponse,
  CreateCalendarRuleBody,
  GetCalendarResponse,
  ListCalendarDraftsResponse,
  ListCalendarRulesResponse,
  ListCalendarsResponse,
  SelectCalendarBody,
  UpdateCalendarDraftBody,
  UpdateCalendarRuleBody,
} from './calendar.js'

describe( 'CalendarConnectionStatus', () => {
  it( 'has the four states of the Settings section', () => {
    expect( CalendarConnectionStatus.options )
      .toEqual( [ 'not_configured', 'not_connected', 'connected', 'broken' ] )
  } )
} )

describe( 'GetCalendarResponse', () => {
  it( 'accepts a status alone', () => {
    expect( GetCalendarResponse.parse( { status: 'not_connected' } ) )
      .toEqual( { status: 'not_connected' } )
  } )

  it( 'accepts a connected account with its calendar and last sync', () => {
    const body = {
      status: 'connected',
      email: 'max@example.test',
      calendar: { id: 'cal-1', name: 'Atlas' },
      import_from: '2026-11-09',
      last_synced_at: '2026-11-10T09:00:00.000Z',
    }

    expect( GetCalendarResponse.parse( body ) ).toEqual( body )
  } )

  it( 'accepts a broken account with its error, and refuses an unknown status', () => {
    expect( GetCalendarResponse.parse( { status: 'broken', error: 'Revoked' } ).error )
      .toBe( 'Revoked' )
    expect( GetCalendarResponse.safeParse( { status: 'gone' } ).success ).toBe( false )
  } )
} )

describe( 'ConnectCalendarResponse and ListCalendarsResponse', () => {
  it( 'carry the consent URL and the calendars', () => {
    expect( ConnectCalendarResponse.parse( { url: 'https://accounts.google.com/x' } ).url )
      .toContain( 'google' )
    expect( ConnectCalendarResponse.safeParse( { url: 'not a url' } ).success ).toBe( false )
    expect( ListCalendarsResponse.parse( {
      calendars: [ { id: 'a', name: 'Atlas', primary: false } ],
    } ).calendars ).toHaveLength( 1 )
  } )
} )

describe( 'SelectCalendarBody', () => {
  it( 'takes a calendar and the day to import from', () => {
    expect( SelectCalendarBody.parse( { calendar_id: 'cal-1', import_from: '2026-11-09' } ) )
      .toEqual( { calendar_id: 'cal-1', import_from: '2026-11-09' } )
  } )

  it( 'refuses an empty calendar, a bad day and extra keys', () => {
    expect( SelectCalendarBody.safeParse( { calendar_id: '', import_from: '2026-11-09' } ).success )
      .toBe( false )
    expect( SelectCalendarBody.safeParse( {
      calendar_id: 'c',
      import_from: '2026-02-30',
    } ).success ).toBe( false )
    expect( SelectCalendarBody.safeParse( {
      calendar_id: 'c',
      import_from: '2026-11-09',
      extra: 1,
    } ).success ).toBe( false )
  } )
} )

describe( 'calendar rules', () => {
  const subject = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
  const goal = '4f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

  it( 'creates a rule with a phrase and exactly one target', () => {
    expect( CreateCalendarRuleBody.parse( { phrase: ' Gym ', subject_id: subject } ) )
      .toEqual( { phrase: 'Gym', subject_id: subject } )
    expect( CreateCalendarRuleBody.parse( { phrase: 'Gym', goal_id: goal } ).goal_id ).toBe( goal )
    expect( CreateCalendarRuleBody.safeParse( { phrase: 'Gym' } ).success ).toBe( false )
    expect( CreateCalendarRuleBody.safeParse( {
      phrase: 'Gym',
      subject_id: subject,
      goal_id: goal,
    } ).success ).toBe( false )
  } )

  it( 'keeps the phrase between 1 and 100 characters and refuses extra keys', () => {
    const make = ( phrase: string ) => CreateCalendarRuleBody
      .safeParse( { phrase, goal_id: goal } ).success

    expect( make( '  ' ) ).toBe( false )
    expect( make( 'x'.repeat( 101 ) ) ).toBe( false )
    expect( make( 'x'.repeat( 100 ) ) ).toBe( true )
    expect( CreateCalendarRuleBody.safeParse( { phrase: 'a', goal_id: goal, x: 1 } ).success )
      .toBe( false )
  } )

  it( 'updates the phrase, one new target or the position, and something at least', () => {
    expect( UpdateCalendarRuleBody.parse( { phrase: 'Run' } ) ).toEqual( { phrase: 'Run' } )
    expect( UpdateCalendarRuleBody.parse( { goal_id: goal } ).goal_id ).toBe( goal )
    expect( UpdateCalendarRuleBody.parse( { position: 0 } ).position ).toBe( 0 )
    expect( UpdateCalendarRuleBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateCalendarRuleBody.safeParse( { subject_id: subject, goal_id: goal } ).success )
      .toBe( false )
    expect( UpdateCalendarRuleBody.safeParse( { position: -1 } ).success ).toBe( false )
  } )

  it( 'lists rules with their target and position', () => {
    const rule = {
      id: subject,
      phrase: 'Gym',
      subject_id: null,
      goal_id: goal,
      position: 0,
    }

    expect( ListCalendarRulesResponse.parse( { rules: [ rule ] } ).rules ).toEqual( [ rule ] )
    expect( CalendarRuleResponse.parse( { rule } ).rule.phrase ).toBe( 'Gym' )
  } )
} )

describe( 'calendar drafts', () => {
  const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
  const goal = '4f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

  const draft = {
    id,
    title: 'Gym',
    started_at: '2026-11-09T07:00:00.000Z',
    ended_at: '2026-11-09T08:00:00.000Z',
    day: '2026-11-09',
    seconds: 3600,
    subject_id: null,
    goal_id: goal,
    assigned_by: 'rule',
    rule_phrase: 'gym',
    note: null,
    overlap_seconds: 1500,
    counts_seconds: 2100,
  }

  it( 'lists drafts with their overlap and what they count', () => {
    expect( ListCalendarDraftsResponse.parse( { drafts: [ draft ] } ).drafts[ 0 ] ).toEqual( draft )
    expect( CalendarDraftResponse.parse( { draft } ).draft.counts_seconds ).toBe( 2100 )
  } )

  it( 'accepts a draft with nothing assigned', () => {
    const bare = { ...draft, goal_id: null, assigned_by: null, rule_phrase: null }

    expect( CalendarDraft.parse( bare ).assigned_by ).toBeNull()
    expect( CalendarDraft.safeParse( { ...draft, assigned_by: 'robot' } ).success ).toBe( false )
  } )

  it( 'edits the target, the times and the note', () => {
    expect( UpdateCalendarDraftBody.parse( { goal_id: goal } ) ).toEqual( { goal_id: goal } )
    expect( UpdateCalendarDraftBody.parse( {
      started_at: '2026-11-09T07:30:00.000Z',
      ended_at: '2026-11-09T08:00:00.000Z',
      note: null,
    } ).note ).toBeNull()
    expect( UpdateCalendarDraftBody.parse( { note: ' Leg day ' } ).note ).toBe( 'Leg day' )
  } )

  it( 'refuses an empty body, two targets, a bad time or a note over 500 characters', () => {
    expect( UpdateCalendarDraftBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateCalendarDraftBody.safeParse( { goal_id: goal, subject_id: id } ).success )
      .toBe( false )
    expect( UpdateCalendarDraftBody.safeParse( { started_at: 'yesterday' } ).success ).toBe( false )
    expect( UpdateCalendarDraftBody.safeParse( { note: 'x'.repeat( 501 ) } ).success ).toBe( false )
    expect( UpdateCalendarDraftBody.safeParse( { title: 'Renamed' } ).success ).toBe( false )
  } )

  it( 'answers an approval with the recorded seconds and the entry, if one was made', () => {
    expect( ApproveCalendarDraftResponse.parse( { time_entry_id: id, recorded_seconds: 2100 } ) )
      .toEqual( { time_entry_id: id, recorded_seconds: 2100 } )
    expect( ApproveCalendarDraftResponse.parse( { time_entry_id: null, recorded_seconds: 0 } )
      .time_entry_id ).toBeNull()
    expect( ApproveMatchedResponse.parse( { approved: 3 } ).approved ).toBe( 3 )
  } )
} )
