// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { ThemisGoalCard, ThemisOverviewArea } from '@atlas/shared'
// App
import {
  learningCardFixture,
  overviewFixture,
  timeFixture,
} from '#src/features/themis/fixtures/themis.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { TimeOverviewCard } from './TimeOverviewCard'

const goal = ( n: number, seconds: number, calendar = 0 ): ThemisGoalCard => {
  const card = learningCardFixture()

  return {
    ...card,
    goal: { ...card.goal, id: `7e000000-0000-4000-8000-00000000000${ n }`, name: `Goal ${ n }` },
    time: timeFixture( seconds, 0, calendar ),
  }
}

const areaOf = ( goals: ThemisGoalCard[] ): ThemisOverviewArea => ( {
  ...overviewFixture().areas[ 0 ],
  time: timeFixture( goals.reduce( ( sum, { time } ) => sum + time.seconds, 0 ) ),
  goals,
} )

const show = ( areas = overviewFixture().areas, onPeriodChange = vi.fn() ) => {
  renderWithClient(
    <TimeOverviewCard areas={ areas } period="week" onPeriodChange={ onPeriodChange } />,
  )
}

describe( 'TimeOverviewCard', () => {
  it( 'shows the time by area and passes on a period change', async () => {
    const onPeriodChange = vi.fn()

    show( overviewFixture().areas, onPeriodChange )

    expect( screen.getByRole( 'listitem', { name: 'Career' } ) ).toBeInTheDocument()

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Month' } ) )

    expect( onPeriodChange ).toHaveBeenCalledWith( 'month' )
  } )

  it( 'lists the top five goals by time, busiest first, each linking to its page', () => {
    show( [ areaOf( [
      goal( 1, 600 ),
      goal( 2, 3600 ),
      goal( 3, 1200 ),
      goal( 4, 2400 ),
      goal( 5, 1800 ),
      goal( 6, 300 ),
    ] ) ] )

    const list = screen.getByRole( 'list', { name: 'Top goals' } )
    const rows = within( list ).getAllByRole( 'listitem' )

    expect( rows ).toHaveLength( 5 )
    expect( rows.map( ( row ) => within( row ).getByRole( 'link' ).textContent ) )
      .toEqual( [ 'Goal 2', 'Goal 4', 'Goal 5', 'Goal 3', 'Goal 1' ] )
    expect( within( rows[ 0 ] ).getByRole( 'link' ) )
      .toHaveAttribute( 'href', '/themis/goals/7e000000-0000-4000-8000-000000000002' )
    expect( within( rows[ 0 ] ).getByText( '1 h' ) ).toBeInTheDocument()
  } )

  it( 'draws calendar time into a goal\'s bar', () => {
    show( [ areaOf( [ goal( 1, 1800, 1800 ) ] ) ] )

    const row = within( screen.getByRole( 'list', { name: 'Top goals' } ) ).getByRole( 'listitem' )

    expect( within( row ).getByRole( 'img', { name: 'Calendar 50%' } ) ).toBeInTheDocument()
  } )

  it( 'leaves out goals with no time, and the whole list when there are none', () => {
    show( [ areaOf( [ goal( 1, 0 ) ] ) ] )

    expect( screen.queryByRole( 'list', { name: 'Top goals' } ) ).not.toBeInTheDocument()
  } )
} )
