// Packages
import { describe, expect, it } from 'vitest'
// Local
import {
  AnswerCheckinBody,
  CreateAreaBody,
  CreateGoalBody,
  LogMetricBody,
  ThemisArea,
  ThemisCheckin,
  ThemisGoal,
  ThemisMetricUpdate,
  UpdateAreaBody,
  UpdateGoalBody,
} from './themis.js'

const area = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  name: 'Career',
  position: 0,
  created_at: '2026-11-07T00:00:00.000Z',
}

const goal = {
  id: '4f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  area_id: area.id,
  name: 'Move into data engineering',
  position: 0,
  target_date: null,
  status: 'active',
  status_changed_at: null,
  created_at: '2026-11-07T00:00:00.000Z',
}

describe( 'ThemisArea', () => {
  it( 'accepts an area', () => {
    expect( ThemisArea.parse( area ) ).toEqual( area )
  } )
} )

describe( 'ThemisGoal', () => {
  it( 'accepts each outcome type with its own fields', () => {
    expect( ThemisGoal.parse( { ...goal, outcome: 'learning' } ).outcome ).toBe( 'learning' )
    expect( ThemisGoal.parse( {
      ...goal,
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
    } ) ).toMatchObject( { metric_target: 30000 } )
    expect( ThemisGoal.parse( {
      ...goal,
      outcome: 'checkin',
      checkin_cadence: 'weekly',
    } ) ).toMatchObject( { checkin_cadence: 'weekly' } )
  } )

  it( 'refuses a metric goal without a target and a check-in goal without a cadence', () => {
    expect( ThemisGoal.safeParse( { ...goal, outcome: 'metric', metric_unit: 'kg' } ).success )
      .toBe( false )
    expect( ThemisGoal.safeParse( { ...goal, outcome: 'checkin' } ).success ).toBe( false )
  } )

  it( 'refuses an unknown outcome or status', () => {
    expect( ThemisGoal.safeParse( { ...goal, outcome: 'mood' } ).success ).toBe( false )
    expect( ThemisGoal.safeParse( { ...goal, outcome: 'learning', status: 'paused' } ).success )
      .toBe( false )
  } )
} )

describe( 'CreateAreaBody and UpdateAreaBody', () => {
  it( 'trims the name and keeps it between 1 and 120 characters', () => {
    expect( CreateAreaBody.parse( { name: '  Career ' } ) ).toEqual( { name: 'Career' } )
    expect( CreateAreaBody.safeParse( { name: '   ' } ).success ).toBe( false )
    expect( CreateAreaBody.safeParse( { name: 'x'.repeat( 121 ) } ).success ).toBe( false )
  } )

  it( 'takes a name, a position or both, and nothing else', () => {
    expect( UpdateAreaBody.parse( { position: 2 } ) ).toEqual( { position: 2 } )
    expect( UpdateAreaBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateAreaBody.safeParse( { position: -1 } ).success ).toBe( false )
    expect( UpdateAreaBody.safeParse( { name: 'A', colour: 'red' } ).success ).toBe( false )
  } )
} )

describe( 'CreateGoalBody', () => {
  const base = { area_id: area.id, name: ' Emergency fund ' }

  it( 'needs an outcome and the fields that go with it', () => {
    expect( CreateGoalBody.parse( { ...base, outcome: 'learning' } ) )
      .toEqual( { area_id: area.id, name: 'Emergency fund', outcome: 'learning' } )
    expect( CreateGoalBody.parse( {
      ...base,
      outcome: 'metric',
      metric_unit: 'SGD',
      metric_target: 30000,
      target_date: '2027-06-30',
    } ) ).toMatchObject( { metric_target: 30000, target_date: '2027-06-30' } )
    expect( CreateGoalBody.parse( { ...base, outcome: 'checkin', checkin_cadence: 'monthly' } ) )
      .toMatchObject( { checkin_cadence: 'monthly' } )
  } )

  it( 'refuses missing or foreign fields', () => {
    expect( CreateGoalBody.safeParse( base ).success ).toBe( false )
    expect( CreateGoalBody.safeParse( { ...base, outcome: 'metric' } ).success ).toBe( false )
    expect( CreateGoalBody.safeParse( { ...base, outcome: 'checkin' } ).success ).toBe( false )
    expect( CreateGoalBody.safeParse( {
      ...base,
      outcome: 'learning',
      metric_target: 1,
    } ).success ).toBe( false )
    expect( CreateGoalBody.safeParse( {
      ...base,
      outcome: 'checkin',
      checkin_cadence: 'daily',
    } ).success ).toBe( false )
  } )

  it( 'refuses a target date that is not a calendar date', () => {
    expect( CreateGoalBody.safeParse( {
      ...base,
      outcome: 'learning',
      target_date: '30/06/2027',
    } ).success ).toBe( false )
    expect( CreateGoalBody.safeParse( {
      ...base,
      outcome: 'learning',
      target_date: '2027-02-31',
    } ).success ).toBe( false )
  } )
} )

describe( 'UpdateGoalBody', () => {
  it( 'takes the editable fields', () => {
    expect( UpdateGoalBody.parse( {
      name: 'New',
      status: 'achieved',
      target_date: null,
      position: 1,
    } ) ).toEqual( { name: 'New', status: 'achieved', target_date: null, position: 1 } )
  } )

  it( 'refuses an outcome, an empty body and unknown keys', () => {
    expect( UpdateGoalBody.safeParse( { outcome: 'metric' } ).success ).toBe( false )
    expect( UpdateGoalBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateGoalBody.safeParse( { name: 'A', colour: 'red' } ).success ).toBe( false )
    expect( UpdateGoalBody.safeParse( { status: 'paused' } ).success ).toBe( false )
  } )
} )

describe( 'LogMetricBody', () => {
  it( 'takes a finite value and an optional note', () => {
    expect( LogMetricBody.parse( { value: 12.5 } ) ).toEqual( { value: 12.5 } )
    expect( LogMetricBody.parse( { value: 0, note: ' paid in ' } ) )
      .toEqual( { value: 0, note: 'paid in' } )
    expect( LogMetricBody.safeParse( { value: '12' } ).success ).toBe( false )
    expect( LogMetricBody.safeParse( {} ).success ).toBe( false )
    expect( LogMetricBody.safeParse( { value: 1, note: 'x'.repeat( 501 ) } ).success ).toBe( false )
    expect( LogMetricBody.safeParse( { value: 1, at: 'now' } ).success ).toBe( false )
  } )
} )

describe( 'AnswerCheckinBody', () => {
  it( 'takes a period start, a rating from 1 to 5 and an optional note', () => {
    expect( AnswerCheckinBody.parse( { period_start: '2026-11-02', rating: 4 } ) )
      .toEqual( { period_start: '2026-11-02', rating: 4 } )
    expect( AnswerCheckinBody.safeParse( { period_start: '2026-11-02', rating: 0 } ).success )
      .toBe( false )
    expect( AnswerCheckinBody.safeParse( { period_start: '2026-11-02', rating: 6 } ).success )
      .toBe( false )
    expect( AnswerCheckinBody.safeParse( { period_start: '2026-11-02', rating: 2.5 } ).success )
      .toBe( false )
    expect( AnswerCheckinBody.safeParse( { period_start: 'Monday', rating: 3 } ).success )
      .toBe( false )
  } )
} )

describe( 'ThemisMetricUpdate and ThemisCheckin', () => {
  it( 'accept what the API stores', () => {
    expect( ThemisMetricUpdate.parse( {
      id: 1,
      value: 3.5,
      note: null,
      at: '2026-11-07T00:00:00.000Z',
    } ).value ).toBe( 3.5 )
    expect( ThemisCheckin.parse( {
      id: 1,
      period_start: '2026-11-02',
      rating: 5,
      note: 'good week',
      created_at: '2026-11-09T00:00:00.000Z',
    } ).rating ).toBe( 5 )
  } )
} )
