// Testing Library
import { render, screen, within } from '@testing-library/react'
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
import { useFolders } from '#src/features/vault/hooks/useFolders'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { LearningRootSetup } from './LearningRootSetup'

vi.mock( '#src/features/vault/hooks/useFolders' )
vi.mock( '#src/features/settings/hooks/useSettings' )

const mockedUseFolders = vi.mocked( useFolders )
const mockedUseSettings = vi.mocked( useSettings )

const tree = [
  { name: 'Learning', path: 'Learning', children: [] },
  { name: 'Mnemosyne', path: 'Mnemosyne', children: [] },
]

type Mutate = ReturnType< typeof vi.fn >

const setup = (
  { currentRoot = null, error = null }: { currentRoot?: string | null, error?: Error | null } = {},
): { mutate: Mutate, onClose: Mutate, user: ReturnType< typeof userEvent.setup > } => {
  const mutate = vi.fn()
  const onClose = vi.fn()
  mockedUseSettings.mockReturnValue( settingsState( {
    updateSettings: mutationStub( { mutate, error, isError: error !== null } ),
  } ) )
  render( <LearningRootSetup currentRoot={ currentRoot } onClose={ onClose } /> )

  return { mutate, onClose, user: userEvent.setup() }
}

const pick = async (
  user: ReturnType< typeof userEvent.setup >,
  name: string,
): Promise< void > => {
  await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
  const item = screen.getByRole( 'treeitem', { name } )
  await user.click( within( item ).getByText( name ) )
}

beforeEach( () => {
  mockedUseFolders.mockReset()
  mockedUseSettings.mockReset()
  mockedUseFolders.mockReturnValue( { defaultFolder: 'Mnemosyne', folders: tree, error: null } )
} )

describe( 'LearningRootSetup', () => {
  it( 'explains what the learning root is', () => {
    setup()

    const dialog = screen.getByRole( 'dialog', { name: 'Learning root' } )
    expect( dialog ).toHaveTextContent( 'Each folder directly under it is a subject' )
  } )

  it( 'cannot save until a folder is chosen', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
  } )

  it( 'saves the chosen folder and closes when the save works', async () => {
    const { mutate, onClose, user } = setup()

    await pick( user, 'Learning' )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { melete_learning_root: 'Learning' },
      expect.objectContaining( { onSuccess: onClose } ),
    )
  } )

  it( 'saves a new folder\'s path, which the server creates (ADR 0072)', async () => {
    const { mutate, onClose, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'New folder name' } ), 'Study' )
    await user.click( screen.getByRole( 'button', { name: 'New folder' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { melete_learning_root: 'Study' },
      expect.objectContaining( { onSuccess: onClose } ),
    )
  } )

  it( 'starts on the current root', () => {
    setup( { currentRoot: 'Learning' } )

    expect( screen.getByText( 'Learning', { selector: 'code' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeEnabled()
  } )

  it( 'shows the server\'s message when the save is refused', () => {
    setup( { error: new Error( 'That folder is not in the vault' ) } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'That folder is not in the vault' )
  } )

  it( 'shows an error when the folders cannot load', () => {
    mockedUseFolders.mockReturnValue( { defaultFolder: null, folders: [], error: 'Boom' } )
    setup()

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Could not load the vault folders: Boom' )
    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
  } )

  it( 'closes on Cancel without saving', async () => {
    const { mutate, onClose, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onClose ).toHaveBeenCalled()
    expect( mutate ).not.toHaveBeenCalled()
  } )
} )
