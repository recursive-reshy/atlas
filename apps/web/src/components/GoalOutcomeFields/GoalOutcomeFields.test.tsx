// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { emptyForm } from '#src/goalForm'
import { CAREER_ID } from '#src/test-support/themis.fixture'
import { GoalOutcomeFields } from './GoalOutcomeFields'

const form = emptyForm( CAREER_ID )

describe( 'GoalOutcomeFields', () => {
  it( 'shows nothing for a learning goal', () => {
    const { container } = render( <GoalOutcomeFields form={ form } onChange={ vi.fn() } /> )

    expect( container ).toBeEmptyDOMElement()
  } )

  it( 'shows the unit and target of a metric goal and reports a change', async () => {
    const onChange = vi.fn()

    render( <GoalOutcomeFields form={ { ...form, outcome: 'metric' } } onChange={ onChange } /> )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Unit (optional)' } ), 'k' )
    await userEvent.type( screen.getByRole( 'spinbutton', { name: 'Target' } ), '3' )

    expect( onChange ).toHaveBeenCalledWith( 'unit', 'k' )
    expect( onChange ).toHaveBeenCalledWith( 'target', '3' )
  } )

  it( 'shows the cadence of a check-in goal and reports a change', async () => {
    const onChange = vi.fn()

    render( <GoalOutcomeFields form={ { ...form, outcome: 'checkin' } } onChange={ onChange } /> )
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Cadence' } ), 'monthly' )

    expect( onChange ).toHaveBeenCalledWith( 'cadence', 'monthly' )
  } )
} )
