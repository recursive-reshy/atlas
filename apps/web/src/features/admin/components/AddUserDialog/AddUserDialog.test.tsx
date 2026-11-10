// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { AddUserDialog } from './AddUserDialog'

const setup = ( overrides: Partial< Parameters< typeof AddUserDialog >[ 0 ] > = {} ) => {
  const handlers = { onSubmit: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <AddUserDialog isSubmitting={ false } error={ null } { ...handlers } { ...overrides } />,
  )

  return { user: userEvent.setup(), ...handlers }
}

describe( 'AddUserDialog', () => {
  it( 'is a dialog with email, name and a checkbox per module', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Add user' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Google email' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'checkbox', { name: 'Mnemosyne' } ) ).not.toBeChecked()
    expect( screen.getByRole( 'checkbox', { name: 'Melete' } ) ).not.toBeChecked()
  } )

  it( 'submits the lower-cased email, the name and the chosen modules', async () => {
    const { user, onSubmit } = setup()

    await user.type(
      screen.getByRole( 'textbox', { name: 'Google email' } ),
      ' Brother@Example.com ',
    )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Brother' )
    await user.click( screen.getByRole( 'checkbox', { name: 'Melete' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Add user' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( {
      email: 'brother@example.com',
      name: 'Brother',
      modules: [ 'melete' ],
    } )
  } )

  it( 'does not submit an invalid email or an empty name, and says why', async () => {
    const { user, onSubmit } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Google email' } ), 'not-an-email' )
    await user.click( screen.getByRole( 'button', { name: 'Add user' } ) )

    expect( onSubmit ).not.toHaveBeenCalled()
    expect( screen.getByRole( 'textbox', { name: 'Google email' } ) )
      .toHaveAttribute( 'aria-invalid', 'true' )
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) )
      .toHaveAttribute( 'aria-invalid', 'true' )
  } )

  it( 'shows the server\'s error, such as a duplicate email', () => {
    setup( { error: 'That email is already a user' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'That email is already a user' )
  } )

  it( 'disables the button while it saves', () => {
    setup( { isSubmitting: true } )

    expect( screen.getByRole( 'button', { name: 'Adding…' } ) ).toBeDisabled()
  } )

  it( 'cancels', async () => {
    const { user, onCancel } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )
