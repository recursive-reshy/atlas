// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import {
  checkinCardFixture,
  learningCardFixture,
  metricCardFixture,
} from '#src/test-support/themis.fixture'
import { OutcomeDisplay } from './OutcomeDisplay'

describe( 'OutcomeDisplay, learning', () => {
  it( 'shows coverage and mastery as bars with percentages', () => {
    render( <OutcomeDisplay outcome={ learningCardFixture().outcome } /> )

    expect( screen.getByText( 'Coverage 50%' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Mastery 25%' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'progressbar', { name: 'Coverage' } ) )
      .toHaveAttribute( 'aria-valuenow', '50' )
    expect( screen.getByRole( 'progressbar', { name: 'Mastery' } ) )
      .toHaveAttribute( 'aria-valuenow', '25' )
  } )

  it( 'says so when the linked subjects have no approved syllabus', () => {
    render( <OutcomeDisplay
      outcome={ { type: 'learning', coverage: null, mastery: null, concept_count: 0 } }
    /> )

    expect( screen.getByText( 'No approved syllabus linked yet' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'OutcomeDisplay, metric', () => {
  it( 'shows the latest value against the target, with the unit, and a bar', () => {
    render( <OutcomeDisplay outcome={ metricCardFixture().outcome } /> )

    expect( screen.getByText( '12 k of 30 k' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'progressbar', { name: 'Progress to target' } ) )
      .toHaveAttribute( 'aria-valuenow', '40' )
  } )

  it( 'shows the trend from the oldest of the last updates to the newest', () => {
    render( <OutcomeDisplay outcome={ metricCardFixture().outcome } /> )

    expect( screen.getByText( 'Trend 5 → 9 → 12' ) ).toBeInTheDocument()
  } )

  it( 'keeps the bar at 100% when the target is passed', () => {
    const { outcome } = metricCardFixture()

    render( <OutcomeDisplay
      outcome={ outcome.type === 'metric' ? { ...outcome, latest: 45 } : outcome }
    /> )

    expect( screen.getByRole( 'progressbar', { name: 'Progress to target' } ) )
      .toHaveAttribute( 'aria-valuenow', '100' )
  } )

  it( 'asks for a first update when there is none', () => {
    render( <OutcomeDisplay
      outcome={ { type: 'metric', unit: null, target: 10, latest: null, updates: [] } }
    /> )

    expect( screen.getByText( 'No updates yet, target 10' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'OutcomeDisplay, check-in', () => {
  it( 'shows the last ratings from oldest to newest', () => {
    render( <OutcomeDisplay outcome={ checkinCardFixture().outcome } /> )

    expect( screen.getByText( 'Weekly check-ins: 2 → 4' ) ).toBeInTheDocument()
  } )

  it( 'says so when there is no check-in yet', () => {
    render( <OutcomeDisplay
      outcome={ { type: 'checkin', cadence: 'monthly', ratings: [] } }
    /> )

    expect( screen.getByText( 'Monthly check-ins: none yet' ) ).toBeInTheDocument()
  } )
} )
