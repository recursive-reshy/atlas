// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { checkinCardFixture, learningCardFixture } from '#src/test-support/themis.fixture'
import { goalDetailFixture } from '#src/test-support/themisGoal.fixture'
import { GoalHistory } from './GoalHistory'

describe( 'GoalHistory', () => {
  it( 'lists a metric goal\'s updates, newest first, with unit, date and note', () => {
    render( <GoalHistory detail={ goalDetailFixture() } /> )

    expect( screen.getByRole( 'heading', { name: 'Updates' } ) ).toBeInTheDocument()

    const items = screen.getAllByRole( 'listitem' ).map( ( item ) => item.textContent )

    expect( items ).toEqual( [ '12 k · 2026-11-03 · Bonus', '9 k · 2026-10-20' ] )
  } )

  it( 'says so when a metric goal has no update', () => {
    render( <GoalHistory detail={ goalDetailFixture( { metric_updates: [] } ) } /> )

    expect( screen.getByText( 'No updates yet' ) ).toBeInTheDocument()
  } )

  it( 'lists a check-in goal\'s ratings with the period and note', () => {
    const { goal, outcome } = checkinCardFixture()

    render( <GoalHistory detail={ goalDetailFixture( {
      goal,
      outcome,
      metric_updates: [],
      checkins: [
        { id: 2, period_start: '2026-10-26', rating: 4, note: 'Good', created_at: 'x' },
        { id: 1, period_start: '2026-10-19', rating: 2, note: null, created_at: 'x' },
      ],
    } ) } /> )

    expect( screen.getByRole( 'heading', { name: 'Check-ins' } ) ).toBeInTheDocument()
    expect( screen.getAllByRole( 'listitem' ).map( ( item ) => item.textContent ) )
      .toEqual( [ '2026-10-26 · 4 of 5 · Good', '2026-10-19 · 2 of 5' ] )
  } )

  it( 'says so when a check-in goal has no answer', () => {
    const { goal, outcome } = checkinCardFixture()

    render( <GoalHistory detail={ goalDetailFixture( { goal, outcome, checkins: [] } ) } /> )

    expect( screen.getByText( 'No check-ins yet' ) ).toBeInTheDocument()
  } )

  it( 'has no history list for a learning goal', () => {
    const { goal, outcome } = learningCardFixture()

    render( <GoalHistory detail={ goalDetailFixture( { goal, outcome } ) } /> )

    expect( screen.queryByRole( 'heading' ) ).not.toBeInTheDocument()
  } )
} )
