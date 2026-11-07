// Testing Library
import { render, screen, within } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { goalDetailFixture } from '#src/test-support/themisGoal.fixture'
import { GoalTimeByWeek } from './GoalTimeByWeek'

describe( 'GoalTimeByWeek', () => {
  it( 'has the heading and a row per week, newest first, with the total as text', () => {
    render( <GoalTimeByWeek weeks={ goalDetailFixture().time_by_week } /> )

    expect( screen.getByRole( 'heading', { name: 'Time by week' } ) ).toBeInTheDocument()

    const rows = screen.getAllByRole( 'listitem' )

    expect( rows.map( ( row ) => row.getAttribute( 'aria-label' ) ) )
      .toEqual( [ 'Week of 2026-11-02', 'Week of 2026-10-26' ] )
    expect( within( rows[ 0 ] ).getByText( '1 h' ) ).toBeInTheDocument()
    expect( within( rows[ 1 ] ).getByText( '30 min' ) ).toBeInTheDocument()
  } )

  it( 'sizes each bar against the busiest week', () => {
    render( <GoalTimeByWeek weeks={ goalDetailFixture().time_by_week } /> )

    const [ busiest, other ] = screen.getAllByTestId( 'time-bar' )

    expect( busiest ).toHaveStyle( { width: '100%' } )
    expect( other ).toHaveStyle( { width: '50%' } )
  } )

  it( 'says so when no week has any time', () => {
    render( <GoalTimeByWeek
      weeks={ [ { week_start: '2026-11-02', measured: 0, logged: 0 } ] }
    /> )

    expect( screen.getByText( 'No time yet' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'listitem' ) ).not.toBeInTheDocument()
  } )
} )
