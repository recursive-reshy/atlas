// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useSignOut } from '#src/app/useSignOut'
import { useVaultChoices } from '#src/features/vault/hooks/useVaultChoices'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ChooseVault } from './ChooseVault'

vi.mock( '#src/features/vault/hooks/useVaultChoices' )
vi.mock( '#src/app/useSignOut' )

type State = ReturnType< typeof useVaultChoices >

const claim = vi.fn()
const create = vi.fn()
const signOut = vi.fn()

const state = ( overrides: Partial< State > = {} ): void => {
  vi.mocked( useVaultChoices ).mockReturnValue( {
    folders: [ 'naresh', 'shared-notes' ],
    canCreate: true,
    isLoading: false,
    error: null,
    claim: mutationStub( { mutate: claim } ),
    create: mutationStub( { mutate: create } ),
    ...overrides,
  } )
}

beforeEach( () => {
  claim.mockReset()
  create.mockReset()
  signOut.mockReset()
  vi.mocked( useSignOut ).mockReturnValue( mutationStub( { mutate: signOut } ) )
  state()
} )

describe( 'ChooseVault', () => {
  it( 'says nothing about a missing folder when none is given', () => {
    renderWithClient( <ChooseVault /> )

    expect( screen.queryByText( /is missing/ ) ).not.toBeInTheDocument()
  } )

  it( 'names the folder that is missing and offers the same choices', async () => {
    renderWithClient( <ChooseVault missingVault="old-vault" /> )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Your vault folder old-vault is missing' )
    expect( screen.getByRole( 'button', { name: 'Create vault' } ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'radio', { name: 'naresh' } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Use this vault' } ) )

    expect( claim ).toHaveBeenCalledWith( 'naresh' )
  } )

  it( 'lists the unclaimed folders as radio buttons and claims the chosen one', async () => {
    renderWithClient( <ChooseVault /> )
    const button = screen.getByRole( 'button', { name: 'Use this vault' } )

    expect( screen.getAllByRole( 'radio' ).map( ( radio ) => radio.getAttribute( 'value' ) ) )
      .toEqual( [ 'naresh', 'shared-notes' ] )
    expect( button ).toBeDisabled()

    await userEvent.click( screen.getByRole( 'radio', { name: 'shared-notes' } ) )
    await userEvent.click( button )

    expect( claim ).toHaveBeenCalledWith( 'shared-notes' )
  } )

  describe( 'where the admin sets vaults up (canCreate false)', () => {
    const ASK_ADMIN = 'If your vault isn\'t listed, ask the admin to set up its sync.'

    it( 'hides the create field and button and says to ask the admin', () => {
      state( { canCreate: false } )
      renderWithClient( <ChooseVault /> )

      expect( screen.queryByRole( 'textbox', { name: 'New vault name' } ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'button', { name: 'Create vault' } ) ).not.toBeInTheDocument()
      expect( screen.getByText( ASK_ADMIN ) ).toBeInTheDocument()
      expect( screen.getByRole( 'button', { name: 'Use this vault' } ) ).toBeInTheDocument()
    } )

    it( 'still says to ask the admin when no folder is free', () => {
      state( { canCreate: false, folders: [] } )
      renderWithClient( <ChooseVault /> )

      expect( screen.queryByRole( 'radio' ) ).not.toBeInTheDocument()
      expect( screen.getByText( ASK_ADMIN ) ).toBeInTheDocument()
    } )

    it( 'does not offer to create a new vault when the old one is missing', () => {
      state( { canCreate: false } )
      renderWithClient( <ChooseVault missingVault="old-vault" /> )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Pick another folder' )
      expect( screen.getByRole( 'alert' ) ).not.toHaveTextContent( /create/i )
    } )
  } )

  it( 'does not tell the user to ask the admin where creating is allowed', () => {
    renderWithClient( <ChooseVault /> )

    expect( screen.queryByText( /ask the admin/ ) ).not.toBeInTheDocument()
  } )

  it( 'shows only the create field when no folder is free', () => {
    state( { folders: [] } )
    renderWithClient( <ChooseVault /> )

    expect( screen.queryByRole( 'radio' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'New vault name' } ) ).toBeInTheDocument()
  } )

  it( 'states the folder-name rule and creates a valid name', async () => {
    renderWithClient( <ChooseVault /> )

    expect( screen.getByText( /lowercase letters, digits and hyphens/ ) ).toBeInTheDocument()

    await userEvent.type( screen.getByRole( 'textbox', { name: 'New vault name' } ), 'my-vault' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Create vault' } ) )

    expect( create ).toHaveBeenCalledWith( 'my-vault' )
  } )

  it( 'rejects an invalid name without asking the server', async () => {
    renderWithClient( <ChooseVault /> )

    await userEvent.type( screen.getByRole( 'textbox', { name: 'New vault name' } ), 'My Vault' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Create vault' } ) )

    expect( create ).not.toHaveBeenCalled()
    expect( screen.getByRole( 'textbox', { name: 'New vault name' } ) )
      .toHaveAccessibleDescription( /lowercase letters, digits and hyphens/ )
    expect( screen.getByRole( 'textbox', { name: 'New vault name' } ) )
      .toHaveAttribute( 'aria-invalid', 'true' )
  } )

  it( 'shows the server message when a claim is refused', () => {
    state( {
      claim: mutationStub( {
        isError: true,
        error: new Error( 'That vault is already taken' ),
      } ),
    } )
    renderWithClient( <ChooseVault /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'That vault is already taken' )
  } )

  it( 'shows the server message when a create is refused', () => {
    state( {
      create: mutationStub( { isError: true, error: new Error( 'That folder already exists' ) } ),
    } )
    renderWithClient( <ChooseVault /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'That folder already exists' )
  } )

  it( 'announces loading and shows a list error', () => {
    state( { isLoading: true, folders: [] } )
    const { unmount } = renderWithClient( <ChooseVault /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
    unmount()

    state( { error: 'Could not reach the server', folders: [] } )
    renderWithClient( <ChooseVault /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'lets the user sign out of the wrong account', async () => {
    renderWithClient( <ChooseVault /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Sign out' } ) )

    expect( signOut ).toHaveBeenCalledTimes( 1 )
  } )
} )
