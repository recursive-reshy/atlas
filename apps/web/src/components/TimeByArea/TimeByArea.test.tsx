// Testing Library
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { overviewFixture } from '#src/test-support/themis.fixture'
import { TimeByArea } from './TimeByArea'

const show = ( onPeriodChange = vi.fn(), period: 'week' | 'month' | 'quarter' = 'week' ) => {
  render( <TimeByArea
    areas={ overviewFixture().areas }
    period={ period }
    onPeriodChange={ onPeriodChange }
  /> )
}

describe( 'TimeByArea', () => {
  it( 'has the heading', () => {
    show()

    expect( screen.getByRole( 'heading', { name: 'Where your time went' } ) ).toBeInTheDocument()
  } )

  it( 'shows each area with its total and the measured and logged split as text', () => {
    show()

    const career = screen.getByRole( 'listitem', { name: 'Career' } )

    expect( within( career ).getByText( '2 h' ) ).toBeInTheDocument()
    expect( within( career ).getByText( '1 h 30 min measured · 30 min logged' ) )
      .toBeInTheDocument()
  } )

  it( 'draws measured and logged as two shades, in proportion to the busiest area', () => {
    show()

    const career = screen.getByRole( 'listitem', { name: 'Career' } )

    expect( within( career ).getByRole( 'img', { name: 'Measured 75%' } ) ).toBeInTheDocument()
    expect( within( career ).getByRole( 'img', { name: 'Logged 25%' } ) ).toBeInTheDocument()
  } )

  it( 'shows an area with no time as zero without bars', () => {
    show()

    const financial = screen.getByRole( 'listitem', { name: 'Financial' } )

    expect( within( financial ).getByText( '0 min' ) ).toBeInTheDocument()
    expect( within( financial ).queryByRole( 'img' ) ).not.toBeInTheDocument()
  } )

  it( 'marks the current period in the toggle', () => {
    show( vi.fn(), 'month' )

    expect( screen.getByRole( 'button', { name: 'Month' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Week' } ) )
      .toHaveAttribute( 'aria-pressed', 'false' )
  } )

  it( 'asks for another period when one is chosen', async () => {
    const onPeriodChange = vi.fn()

    show( onPeriodChange )
    await userEvent.click( screen.getByRole( 'button', { name: 'Quarter' } ) )

    expect( onPeriodChange ).toHaveBeenCalledWith( 'quarter' )
  } )

  it( 'does not ask again for the period already chosen', async () => {
    const onPeriodChange = vi.fn()

    show( onPeriodChange )
    await userEvent.click( screen.getByRole( 'button', { name: 'Week' } ) )

    expect( onPeriodChange ).not.toHaveBeenCalled()
  } )
} )
