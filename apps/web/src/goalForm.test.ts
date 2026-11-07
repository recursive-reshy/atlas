// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import {
  canSubmit,
  createBody,
  emptyForm,
  formFromGoal,
  updateBody,
} from './goalForm'
import {
  CAREER_ID,
  FINANCE_ID,
  checkinCardFixture,
  learningCardFixture,
  metricCardFixture,
} from './test-support/themis.fixture'

describe( 'emptyForm', () => {
  it( 'starts a learning goal in the given area, weekly, active', () => {
    expect( emptyForm( CAREER_ID ) ).toEqual( {
      name: '',
      areaId: CAREER_ID,
      outcome: 'learning',
      unit: '',
      target: '',
      cadence: 'weekly',
      targetDate: '',
      status: 'active',
    } )
  } )
} )

describe( 'formFromGoal', () => {
  it( 'reads a metric goal', () => {
    expect( formFromGoal( metricCardFixture().goal ) ).toMatchObject( {
      name: 'Emergency fund',
      areaId: FINANCE_ID,
      outcome: 'metric',
      unit: 'k',
      target: '30',
      targetDate: '',
    } )
  } )

  it( 'reads a check-in goal\'s cadence and a goal\'s target date', () => {
    expect( formFromGoal( checkinCardFixture().goal ).cadence ).toBe( 'weekly' )
    expect( formFromGoal( learningCardFixture().goal ).targetDate ).toBe( '2027-03-01' )
  } )
} )

describe( 'canSubmit', () => {
  const form = { ...emptyForm( CAREER_ID ), name: 'Goal' }

  it( 'needs a name and an area', () => {
    expect( canSubmit( form ) ).toBe( true )
    expect( canSubmit( { ...form, name: '  ' } ) ).toBe( false )
    expect( canSubmit( { ...form, areaId: '' } ) ).toBe( false )
  } )

  it( 'needs a number as the target of a metric goal, zero included', () => {
    const metric = { ...form, outcome: 'metric' as const }

    expect( canSubmit( metric ) ).toBe( false )
    expect( canSubmit( { ...metric, target: 'abc' } ) ).toBe( false )
    expect( canSubmit( { ...metric, target: '0' } ) ).toBe( true )
    expect( canSubmit( { ...metric, target: '12.5' } ) ).toBe( true )
  } )
} )

describe( 'createBody', () => {
  const form = { ...emptyForm( CAREER_ID ), name: ' Goal ' }

  it( 'is a learning goal with only what applies', () => {
    expect( createBody( form ) )
      .toEqual( { area_id: CAREER_ID, name: 'Goal', outcome: 'learning' } )
    expect( createBody( { ...form, targetDate: '2027-01-01' } ) )
      .toEqual( {
        area_id: CAREER_ID,
        name: 'Goal',
        outcome: 'learning',
        target_date: '2027-01-01',
      } )
  } )

  it( 'adds the unit only when there is one, and the target as a number', () => {
    const metric = { ...form, outcome: 'metric' as const, target: '30' }

    expect( createBody( metric ) )
      .toEqual( { area_id: CAREER_ID, name: 'Goal', outcome: 'metric', metric_target: 30 } )
    expect( createBody( { ...metric, unit: ' k ' } ) ).toMatchObject( { metric_unit: 'k' } )
  } )

  it( 'adds the cadence of a check-in goal and no metric field', () => {
    expect( createBody( { ...form, outcome: 'checkin', cadence: 'monthly', target: '5' } ) )
      .toEqual( {
        area_id: CAREER_ID,
        name: 'Goal',
        outcome: 'checkin',
        checkin_cadence: 'monthly',
      } )
  } )
} )

describe( 'updateBody', () => {
  it( 'is empty when nothing changed', () => {
    const goal = metricCardFixture().goal

    expect( updateBody( goal, formFromGoal( goal ) ) ).toEqual( {} )
  } )

  it( 'has only the changed fields', () => {
    const goal = metricCardFixture().goal
    const form = { ...formFromGoal( goal ), name: 'Fund', status: 'dropped' as const }

    expect( updateBody( goal, form ) ).toEqual( { name: 'Fund', status: 'dropped' } )
  } )

  it( 'clears a date and a unit with null', () => {
    const goal = { ...metricCardFixture().goal, target_date: '2027-01-01' }
    const form = { ...formFromGoal( goal ), targetDate: '', unit: '  ' }

    expect( updateBody( goal, form ) ).toEqual( { target_date: null, metric_unit: null } )
  } )

  it( 'changes a metric target as a number', () => {
    const goal = metricCardFixture().goal

    expect( updateBody( goal, { ...formFromGoal( goal ), target: '45' } ) )
      .toEqual( { metric_target: 45 } )
  } )

  it( 'changes a check-in goal\'s cadence and moves a goal to another area', () => {
    const goal = checkinCardFixture().goal
    const form = { ...formFromGoal( goal ), cadence: 'monthly' as const, areaId: CAREER_ID }

    expect( updateBody( goal, form ) )
      .toEqual( { checkin_cadence: 'monthly', area_id: CAREER_ID } )
  } )

  it( 'never sends fields of another outcome', () => {
    const goal = learningCardFixture().goal
    const form = { ...formFromGoal( goal ), unit: 'k', target: '9', cadence: 'monthly' as const }

    expect( updateBody( goal, form ) ).toEqual( {} )
  } )
} )
