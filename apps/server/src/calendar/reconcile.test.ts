// Packages
import { describe, expect, it } from 'vitest'
// Calendar
import { reconcile } from './reconcile.js'
import type { ExistingEvent, IncomingEvent } from './reconcile.js'
import type { MatchableRule } from './rules.js'

const NOW = new Date( '2026-11-10T12:00:00.000Z' )
const FROM = new Date( '2026-11-03T00:00:00.000Z' )

const incoming = ( id: string, overrides: Partial< IncomingEvent > = {} ): IncomingEvent => ( {
  event_id: id,
  title: 'Gym',
  started_at: '2026-11-09T07:00:00.000Z',
  ended_at: '2026-11-09T08:00:00.000Z',
  ...overrides,
} )

const existing = ( id: string, overrides: Partial< ExistingEvent > = {} ): ExistingEvent => ( {
  id: `row-${ id }`,
  event_id: id,
  status: 'draft',
  title: 'Gym',
  started_at: '2026-11-09T07:00:00.000Z',
  ended_at: '2026-11-09T08:00:00.000Z',
  assigned_by: null,
  ...overrides,
} )

const rules: MatchableRule[] = [
  { id: 'r1', phrase: 'gym', position: 0, subject_id: null, goal_id: 'g1' },
]

const run = (
  incomingEvents: IncomingEvent[],
  existingEvents: ExistingEvent[] = [],
) => reconcile( {
  incoming: incomingEvents,
  existing: existingEvents,
  rules,
  from: FROM,
  now: NOW,
} )

describe( 'reconcile: new events', () => {
  it( 'inserts an unknown finished event as a draft, assigned by the first matching rule', () => {
    const { inserts } = run( [ incoming( 'a' ) ] )

    expect( inserts ).toEqual( [ {
      ...incoming( 'a' ),
      assignment: { rule_id: 'r1', subject_id: null, goal_id: 'g1' },
    } ] )
  } )

  it( 'inserts an event no rule matches with no assignment', () => {
    expect( run( [ incoming( 'a', { title: 'Dentist' } ) ] ).inserts[ 0 ]?.assignment ).toBeNull()
  } )

  it( 'skips events that have not ended, or end exactly now or later', () => {
    const later = incoming( 'a', { ended_at: '2026-11-10T12:00:01.000Z' } )
    const atNow = incoming( 'b', { ended_at: '2026-11-10T12:00:00.000Z' } )

    expect( run( [ later ] ).inserts ).toEqual( [] )
    expect( run( [ atNow ] ).inserts ).toHaveLength( 1 )
  } )

  it( 'skips events with no length or that end before they start', () => {
    const zero = incoming( 'a', { ended_at: '2026-11-09T07:00:00.000Z' } )
    const backwards = incoming( 'b', { ended_at: '2026-11-09T06:00:00.000Z' } )

    expect( run( [ zero, backwards ] ).inserts ).toEqual( [] )
  } )

  it( 'does not insert an event an approved or dismissed row already marks', () => {
    const result = run(
      [ incoming( 'a' ), incoming( 'b' ) ],
      [ existing( 'a', { status: 'approved' } ), existing( 'b', { status: 'dismissed' } ) ],
    )

    expect( result ).toEqual( { inserts: [], updates: [], deletes: [] } )
  } )
} )

describe( 'reconcile: known drafts', () => {
  it( 'changes nothing when the event is unchanged', () => {
    expect( run( [ incoming( 'a' ) ], [ existing( 'a' ) ] ) )
      .toEqual( { inserts: [], updates: [], deletes: [] } )
  } )

  it( 'updates a draft whose times changed, without reapplying rules', () => {
    const moved = incoming( 'a', {
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: '2026-11-09T10:00:00.000Z',
    } )

    expect( run( [ moved ], [ existing( 'a' ) ] ).updates ).toEqual( [ {
      id: 'row-a',
      title: 'Gym',
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: '2026-11-09T10:00:00.000Z',
      reapply: false,
    } ] )
  } )

  it( 'reapplies rules when the title changed, unless the draft was assigned by hand', () => {
    const renamed = incoming( 'a', { title: 'Gym (leg day)' } )

    expect( run( [ renamed ], [ existing( 'a' ) ] ).updates[ 0 ]?.reapply ).toBe( true )
    expect( run( [ renamed ], [ existing( 'a', { assigned_by: 'rule' } ) ] ).updates[ 0 ]?.reapply )
      .toBe( true )
    expect( run( [ renamed ], [ existing( 'a', { assigned_by: 'hand' } ) ] ).updates[ 0 ]?.reapply )
      .toBe( false )
  } )

  it( 'never updates an approved or dismissed row, even if the event changed', () => {
    const renamed = incoming( 'a', { title: 'Something else' } )

    expect( run( [ renamed ], [ existing( 'a', { status: 'approved' } ) ] ).updates ).toEqual( [] )
    expect( run( [ renamed ], [ existing( 'a', { status: 'dismissed' } ) ] ).updates ).toEqual( [] )
  } )
} )

describe( 'reconcile: drafts that disappeared', () => {
  it( 'deletes a draft in the window that the calendar no longer returns', () => {
    expect( run( [], [ existing( 'a' ) ] ).deletes ).toEqual( [ 'row-a' ] )
  } )

  it( 'deletes a draft whose event is now unfinished or has no length', () => {
    const unfinished = incoming( 'a', { ended_at: '2026-11-11T08:00:00.000Z' } )

    expect( run( [ unfinished ], [ existing( 'a' ) ] ).deletes ).toEqual( [ 'row-a' ] )
  } )

  it( 'keeps approved and dismissed rows when they disappear', () => {
    expect( run( [], [
      existing( 'a', { status: 'approved' } ),
      existing( 'b', { status: 'dismissed' } ),
    ] ).deletes ).toEqual( [] )
  } )

  it( 'keeps a draft that started outside the window', () => {
    const old = existing( 'a', { started_at: '2026-10-01T07:00:00.000Z' } )
    const future = existing( 'b', { started_at: '2026-11-11T07:00:00.000Z' } )

    expect( run( [], [ old, future ] ).deletes ).toEqual( [] )
  } )

  it( 'reads a draft at the very start of the window as inside it', () => {
    const edge = existing( 'a', { started_at: FROM.toISOString() } )

    expect( run( [], [ edge ] ).deletes ).toEqual( [ 'row-a' ] )
  } )
} )
