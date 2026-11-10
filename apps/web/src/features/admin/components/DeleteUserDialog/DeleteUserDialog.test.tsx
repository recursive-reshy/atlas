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
import { adminUserFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { DeleteUserDialog } from './DeleteUserDialog'

const setup = ( overrides: Partial< Parameters< typeof DeleteUserDialog >[ 0 ] > = {} ) => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <DeleteUserDialog
      user={ adminUserFixture( { status: 'removed' } ) }
      isSubmitting={ false }
      error={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { user: userEvent.setup(), ...handlers }
}

const DELETE = { name: 'Delete user' }

describe( 'DeleteUserDialog', () => {
  it( 'says what is deleted and what is not', () => {
    setup()

    const dialog = screen.getByRole( 'dialog', { name: 'Delete Brother?' } )

    expect( dialog ).toHaveTextContent( 'all their data' )
    expect( dialog ).toHaveTextContent( 'vault folder is not touched' )
  } )

  it( 'keeps Delete user off until the email matches exactly', async () => {
    const { user, onConfirm } = setup()
    const field = screen.getByRole( 'textbox', { name: 'Type brother@example.com to confirm' } )

    expect( screen.getByRole( 'button', DELETE ) ).toBeDisabled()

    await user.type( field, 'brother@example.co' )
    expect( screen.getByRole( 'button', DELETE ) ).toBeDisabled()

    await user.type( field, 'm' )
    expect( screen.getByRole( 'button', DELETE ) ).toBeEnabled()

    await user.click( screen.getByRole( 'button', DELETE ) )

    expect( onConfirm ).toHaveBeenCalledWith( 'brother@example.com' )
  } )

  it( 'does not accept the email in another case', async () => {
    const { user } = setup()

    await user.type(
      screen.getByRole( 'textbox', { name: 'Type brother@example.com to confirm' } ),
      'Brother@example.com',
    )

    expect( screen.getByRole( 'button', DELETE ) ).toBeDisabled()
  } )

  it( 'shows the server\'s error and cancels', async () => {
    const { user, onCancel } = setup( { error: 'Boom' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Boom' )

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )
