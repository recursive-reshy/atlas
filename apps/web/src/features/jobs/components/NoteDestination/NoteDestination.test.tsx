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
import { useFolders } from '#src/hooks/useFolders'
import { NoteDestination } from './NoteDestination'

vi.mock( '#src/hooks/useFolders' )

const mockedUseFolders = vi.mocked( useFolders )

const renderDestination = (
  props: { folder?: string | null, defaultFolder?: string, onFolderChange?: () => void } = {},
): void => {
  render(
    <NoteDestination
      title="A talk"
      defaultFolder={ props.defaultFolder ?? 'Mnemosyne' }
      folder={ props.folder ?? null }
      onFolderChange={ props.onFolderChange ?? vi.fn() }
    />,
  )
}

const tree = [
  { name: 'Learning', path: 'Learning', children: [] },
  { name: 'Mnemosyne', path: 'Mnemosyne', children: [] },
]

beforeEach( () => {
  mockedUseFolders.mockReset()
  mockedUseFolders.mockReturnValue( { defaultFolder: 'Mnemosyne', folders: tree, error: null } )
} )

describe( 'NoteDestination', () => {
  it( 'shows the folder picker and where the note will go', () => {
    renderDestination()

    expect( screen.getByRole( 'button', { name: 'Change folder' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Mnemosyne/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'follows the stored folder', () => {
    renderDestination( { folder: 'Learning' } )

    expect( screen.getByText( 'Learning/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'starts on the job\'s default folder, not the configured one', () => {
    render(
      <NoteDestination
        defaultFolder="Learning/React"
        title="A talk"
        folder={ null }
        onFolderChange={ vi.fn() }
      />,
    )

    expect( screen.getByText( 'Learning/React/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'prefers the picked folder to the job\'s default', () => {
    render(
      <NoteDestination
        defaultFolder="Learning/React"
        title="A talk"
        folder="Projects"
        onFolderChange={ vi.fn() }
      />,
    )

    expect( screen.getByText( 'Projects/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'reports null when the job\'s default folder is chosen again', async () => {
    const onFolderChange = vi.fn()
    render(
      <NoteDestination
        defaultFolder="Learning"
        title="A talk"
        folder="Mnemosyne"
        onFolderChange={ onFolderChange }
      />,
    )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
    await user.click(
      within( screen.getByRole( 'treeitem', { name: 'Learning' } ) ).getByText( 'Learning' ),
    )

    expect( onFolderChange ).toHaveBeenCalledExactlyOnceWith( null )
  } )

  it( 'reports a chosen folder', async () => {
    const onFolderChange = vi.fn()
    renderDestination( { onFolderChange } )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
    await user.click(
      within( screen.getByRole( 'treeitem', { name: 'Learning' } ) ).getByText( 'Learning' ),
    )

    expect( onFolderChange ).toHaveBeenCalledExactlyOnceWith( 'Learning' )
  } )

  it( 'says the folders could not be loaded and still names the default folder', () => {
    mockedUseFolders.mockReturnValue(
      { defaultFolder: null, folders: [], error: 'Could not reach the server' },
    )
    renderDestination()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.queryByRole( 'button', { name: 'Change folder' } ) ).not.toBeInTheDocument()
    expect( screen.getByText( 'Mnemosyne/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'still shows a stored folder when the folders could not be loaded', () => {
    mockedUseFolders.mockReturnValue( { defaultFolder: null, folders: [], error: 'boom' } )
    renderDestination( { folder: 'Learning' } )

    expect( screen.getByText( 'Learning/A talk.md' ) ).toBeInTheDocument()
  } )
} )
