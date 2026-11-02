// Testing Library
import { screen, within } from '@testing-library/react'
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
import { useAdminUsers } from '#src/hooks/useAdminUsers'
import { adminUserFixture, meFixture } from '#src/test-support/me.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { AdminTab } from './AdminTab'

vi.mock( '#src/hooks/useAdminUsers' )
vi.mock( '../UsageSection', () => ( { UsageSection: () => <p>usage section</p> } ) )

type State = ReturnType< typeof useAdminUsers >

const ADMIN = adminUserFixture( {
  id: meFixture().id,
  email: 'naresh@example.com',
  name: 'Naresh',
  role: 'admin',
  modules: [ 'transcriber', 'melete' ],
} )
const BROTHER = adminUserFixture()
const REMOVED = adminUserFixture( {
  id: '5c8d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  email: 'cousin@example.com',
  name: 'Cousin',
  status: 'removed',
} )

const mutations = {
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetVault: vi.fn(),
  deleteUser: vi.fn(),
}

const state = ( overrides: Partial< State > = {} ): void => {
  vi.mocked( useAdminUsers ).mockReturnValue( {
    users: [ ADMIN, BROTHER, REMOVED ],
    isLoading: false,
    error: null,
    createUser: mutationStub( { mutate: mutations.createUser } ),
    updateUser: mutationStub( { mutate: mutations.updateUser } ),
    resetVault: mutationStub( { mutate: mutations.resetVault } ),
    deleteUser: mutationStub( { mutate: mutations.deleteUser } ),
    ...overrides,
  } )
}

const cardFor = ( name: string ): HTMLElement => {
  return screen.getByRole( 'heading', { name } ).closest( 'li' ) as HTMLElement
}

const clickIn = async ( card: string, button: string ): Promise< void > => {
  await userEvent.click( within( cardFor( card ) ).getByRole( 'button', { name: button } ) )
}

beforeEach( () => {
  Object.values( mutations ).forEach( ( mutation ) => mutation.mockReset() )
  state()
} )

describe( 'AdminTab', () => {
  it( 'lists every user with the usage section below', () => {
    renderWithClient( <AdminTab /> )

    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 3 )
    expect( screen.getByText( 'usage section' ) ).toBeInTheDocument()
  } )

  it( 'announces loading and shows a load error', () => {
    state( { users: [], isLoading: true } )
    const { unmount } = renderWithClient( <AdminTab /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading users' )
    unmount()

    state( { users: [], error: 'Boom' } )
    renderWithClient( <AdminTab /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Boom' )
  } )

  it( 'switches a module with the user\'s other modules kept', async () => {
    renderWithClient( <AdminTab /> )

    await userEvent.click(
      within( cardFor( 'Brother' ) ).getByRole( 'switch', { name: 'Melete' } ),
    )

    expect( mutations.updateUser ).toHaveBeenCalledWith(
      { id: BROTHER.id, body: { modules: [ 'transcriber', 'melete' ] } },
    )
  } )

  it( 'removes and restores without asking', async () => {
    renderWithClient( <AdminTab /> )

    await clickIn( 'Brother', 'Remove' )
    await clickIn( 'Cousin', 'Restore' )

    expect( mutations.updateUser ).toHaveBeenNthCalledWith(
      1,
      { id: BROTHER.id, body: { status: 'removed' } },
    )
    expect( mutations.updateUser ).toHaveBeenNthCalledWith(
      2,
      { id: REMOVED.id, body: { status: 'active' } },
    )
  } )

  it( 'asks before resetting a vault, and cancels cleanly', async () => {
    renderWithClient( <AdminTab /> )

    await userEvent.click(
      within( cardFor( 'Brother' ) ).getByRole( 'button', { name: 'Reset vault' } ),
    )
    const dialog = screen.getByRole( 'dialog', { name: 'Reset Brother\'s vault?' } )

    expect( dialog ).toHaveTextContent( 'choose their vault again' )

    await userEvent.click( within( dialog ).getByRole( 'button', { name: 'Cancel' } ) )

    expect( mutations.resetVault ).not.toHaveBeenCalled()
    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'resets the vault once confirmed', async () => {
    renderWithClient( <AdminTab /> )

    await userEvent.click(
      within( cardFor( 'Brother' ) ).getByRole( 'button', { name: 'Reset vault' } ),
    )
    await userEvent.click(
      within( screen.getByRole( 'dialog' ) ).getByRole( 'button', { name: 'Reset vault' } ),
    )

    expect( mutations.resetVault ).toHaveBeenCalledWith( BROTHER.id )
  } )

  it( 'deletes a removed user only after the email is typed', async () => {
    renderWithClient( <AdminTab /> )

    await clickIn( 'Cousin', 'Delete user' )
    await userEvent.type(
      screen.getByRole( 'textbox', { name: 'Type cousin@example.com to confirm' } ),
      'cousin@example.com',
    )
    await userEvent.click(
      within( screen.getByRole( 'dialog' ) ).getByRole( 'button', { name: 'Delete user' } ),
    )

    expect( mutations.deleteUser ).toHaveBeenCalledWith(
      { id: REMOVED.id, confirm: 'cousin@example.com' },
      expect.anything(),
    )
  } )

  it( 'opens Add user and creates the user', async () => {
    renderWithClient( <AdminTab /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Add user' } ) )
    await userEvent.type(
      screen.getByRole( 'textbox', { name: 'Google email' } ),
      'new@example.com',
    )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'New' )
    await userEvent.click( screen.getByRole( 'checkbox', { name: 'Mnemosyne' } ) )
    await userEvent.click(
      within( screen.getByRole( 'dialog' ) ).getByRole( 'button', { name: 'Add user' } ),
    )

    expect( mutations.createUser ).toHaveBeenCalledWith(
      { email: 'new@example.com', name: 'New', modules: [ 'transcriber' ] },
      expect.anything(),
    )
  } )

  it( 'shows a failed action as an alert', () => {
    const error = new Error( 'You can\'t change your own account here' )
    state( { updateUser: mutationStub( { isError: true, error } ) } )
    renderWithClient( <AdminTab /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( error.message )
  } )
} )
