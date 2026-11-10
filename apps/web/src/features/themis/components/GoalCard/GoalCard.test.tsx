// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import {
  LEARN_GOAL_ID,
  SUBJECT_ID,
  checkinCardFixture,
  learningCardFixture,
} from '#src/features/themis/fixtures/themis.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GoalCard } from './GoalCard'

describe( 'GoalCard', () => {
  it( 'links the name to the goal page', () => {
    renderWithClient( <GoalCard card={ learningCardFixture() } /> )

    expect( screen.getByRole( 'link', { name: 'Move into data engineering' } ) )
      .toHaveAttribute( 'href', `/themis/goals/${ LEARN_GOAL_ID }` )
  } )

  it( 'shows the target date and the time this period', () => {
    renderWithClient( <GoalCard card={ learningCardFixture() } /> )

    expect( screen.getByText( 'Target 2027-03-01' ) ).toBeInTheDocument()
    expect( screen.getByText( '2 h this period' ) ).toBeInTheDocument()
  } )

  it( 'shows the outcome and the linked subjects', () => {
    renderWithClient( <GoalCard card={ learningCardFixture() } /> )

    expect( screen.getByText( 'Coverage 50%' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Data Engineering' ) ).toBeInTheDocument()
    expect( SUBJECT_ID ).toBeTruthy()
  } )

  it( 'leaves out the target date and subjects when there are none', () => {
    renderWithClient( <GoalCard card={ checkinCardFixture() } /> )

    expect( screen.queryByText( /^Target/ ) ).not.toBeInTheDocument()
    expect( screen.getByText( '0 min this period' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Weekly check-ins: 2 → 4' ) ).toBeInTheDocument()
  } )
} )
