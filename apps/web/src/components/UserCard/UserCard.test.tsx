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
import { UserCard } from './UserCard'

const setup = ( user = adminUserFixture() ) => {
  const handlers = {
    onModulesChange: vi.fn(),
    onRemove: vi.fn(),
    onRestore: vi.fn(),
    onResetVault: vi.fn(),
    onDelete: vi.fn(),
  }

  renderWithClient( <UserCard user={ user } { ...handlers } /> )

  return { user: userEvent.setup(), ...handlers }
}

describe( 'UserCard details', () => {
  it( 'shows name, email, role, status, vault folder and last sign-in', () => {
    setup()

    expect( screen.getByRole( 'heading', { name: 'Brother' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'brother@example.com' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Member' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Active' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Vault: brother' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Last sign-in: 2026-10-27' ) ).toBeInTheDocument()
  } )

  it( 'says so when there is no vault or sign-in yet', () => {
    setup( adminUserFixture( { vault_dir: null, last_signin_at: null } ) )

    expect( screen.getByText( 'No vault yet' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Never signed in' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Reset vault' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows Removed in words, not only by colour', () => {
    setup( adminUserFixture( { status: 'removed' } ) )

    expect( screen.getByText( 'Removed' ) ).toBeInTheDocument()
  } )

  it( 'has no link into the user\'s content', () => {
    setup()

    expect( screen.queryByRole( 'link' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'UserCard modules', () => {
  it( 'shows a switch per module, set from the user', () => {
    setup( adminUserFixture( { modules: [ 'melete' ] } ) )

    expect( screen.getByRole( 'switch', { name: 'Mnemosyne' } ) ).not.toBeChecked()
    expect( screen.getByRole( 'switch', { name: 'Melete' } ) ).toBeChecked()
  } )

  it( 'turns a module on, keeping the others', async () => {
    const { user, onModulesChange } = setup( adminUserFixture( { modules: [ 'melete' ] } ) )

    await user.click( screen.getByRole( 'switch', { name: 'Mnemosyne' } ) )

    expect( onModulesChange ).toHaveBeenCalledWith( [ 'transcriber', 'melete' ] )
  } )

  it( 'turns a module off, keeping the others', async () => {
    const { user, onModulesChange } = setup(
      adminUserFixture( { modules: [ 'transcriber', 'melete' ] } ),
    )

    await user.click( screen.getByRole( 'switch', { name: 'Melete' } ) )

    expect( onModulesChange ).toHaveBeenCalledWith( [ 'transcriber' ] )
  } )

  it( 'still allows changing a removed user\'s modules', () => {
    setup( adminUserFixture( { status: 'removed' } ) )

    expect( screen.getByRole( 'switch', { name: 'Melete' } ) ).toBeEnabled()
  } )
} )

describe( 'UserCard actions', () => {
  it( 'removes an active user', async () => {
    const { user, onRemove } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Remove' } ) )

    expect( onRemove ).toHaveBeenCalledTimes( 1 )
    expect( screen.queryByRole( 'button', { name: 'Restore' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Delete user' } ) ).not.toBeInTheDocument()
  } )

  it( 'resets an active user\'s vault', async () => {
    const { user, onResetVault } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Reset vault' } ) )

    expect( onResetVault ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'restores or deletes a removed user', async () => {
    const { user, onRestore, onDelete } = setup( adminUserFixture( { status: 'removed' } ) )

    await user.click( screen.getByRole( 'button', { name: 'Restore' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Delete user' } ) )

    expect( onRestore ).toHaveBeenCalledTimes( 1 )
    expect( onDelete ).toHaveBeenCalledTimes( 1 )
    expect( screen.queryByRole( 'button', { name: 'Remove' } ) ).not.toBeInTheDocument()
  } )

  it( 'gives the admin no controls at all', () => {
    setup( adminUserFixture( { role: 'admin', modules: [ 'transcriber', 'melete' ] } ) )

    expect( screen.getByText( 'Admin' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Every module' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'switch' ) ).not.toBeInTheDocument()
  } )
} )
