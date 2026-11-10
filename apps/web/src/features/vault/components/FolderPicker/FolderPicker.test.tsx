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
// Shared
import type { FolderNode } from '@atlas/shared'
// App
import { FolderPicker } from './FolderPicker'

const folders: FolderNode[] = [
  {
    name: 'Learning',
    path: 'Learning',
    children: [
      { name: 'AI', path: 'Learning/AI', children: [] },
      { name: 'Rust', path: 'Learning/Rust', children: [] },
    ],
  },
  { name: 'Mnemosyne', path: 'Mnemosyne', children: [] },
  { name: 'Projects', path: 'Projects', children: [] },
]

const setup = ( value: string | null = null ) => {
  const onChange = vi.fn()

  render(
    <FolderPicker
      folders={ folders }
      defaultFolder="Mnemosyne"
      value={ value }
      onChange={ onChange }
    />,
  )

  return { onChange, user: userEvent.setup() }
}

const open = async ( user: ReturnType< typeof userEvent.setup > ): Promise< void > => {
  await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
}

// A tree item's name is set by the component, with "(new)" added for pending folders.
const item = ( name: string ): HTMLElement => {
  return screen.getByRole( 'treeitem', { name: new RegExp( `^${ name }( \\(new\\))?$` ) } )
}

// Clicks land on the visible label: the item itself also contains its child group.
const label = ( name: string ): HTMLElement => within( item( name ) ).getByText( name )

describe( 'FolderPicker destination', () => {
  it.each( [
    [ null, 'Mnemosyne' ],
    [ 'Learning/AI', 'Learning/AI' ],
    [ '', 'Vault root' ],
  ] )( 'shows %j as %s', ( value, shown ) => {
    setup( value )

    expect( screen.getByText( shown ) ).toBeInTheDocument()
  } )

  it( 'keeps the tree closed until asked', async () => {
    const { user } = setup( 'Learning/AI' )

    expect( screen.queryByRole( 'tree' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'textbox', { name: 'Filter folders' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Change folder' } ) )
      .toHaveAttribute( 'aria-expanded', 'false' )

    await open( user )

    expect( screen.getByRole( 'button', { name: 'Change folder' } ) )
      .toHaveAttribute( 'aria-expanded', 'true' )
    expect( screen.getByRole( 'tree' ) ).toBeInTheDocument()
    expect( item( 'Rust' ) ).toBeInTheDocument()
  } )

  it( 'opens with the branch to the chosen folder expanded and the rest collapsed', async () => {
    const { user } = setup( 'Learning/AI' )
    await open( user )

    expect( item( 'Learning' ) ).toHaveAttribute( 'aria-expanded', 'true' )
    expect( item( 'Projects' ) ).not.toHaveAttribute( 'aria-expanded' )
    expect( screen.getByRole( 'treeitem', { name: 'Vault root' } ) ).toBeInTheDocument()
  } )

  it( 'lists the vault root first', async () => {
    const { user } = setup()
    await open( user )

    expect( screen.getAllByRole( 'treeitem' )[ 0 ] ).toHaveAccessibleName( 'Vault root' )
  } )
} )

describe( 'FolderPicker choosing', () => {
  it( 'marks the default folder as chosen when nothing is stored', async () => {
    const { user } = setup( null )
    await open( user )

    expect( item( 'Mnemosyne' ) ).toHaveAttribute( 'aria-selected', 'true' )
    expect( item( 'Projects' ) ).toHaveAttribute( 'aria-selected', 'false' )
  } )

  it( 'marks the stored folder as chosen', async () => {
    const { user } = setup( 'Learning/AI' )
    await open( user )

    expect( item( 'AI' ) ).toHaveAttribute( 'aria-selected', 'true' )
    expect( item( 'Mnemosyne' ) ).toHaveAttribute( 'aria-selected', 'false' )
  } )

  it( 'marks the vault root as chosen when the root is stored', async () => {
    const { user } = setup( '' )
    await open( user )

    expect( item( 'Vault root' ) ).toHaveAttribute( 'aria-selected', 'true' )
  } )

  it( 'reports a folder by its path', async () => {
    const { user, onChange } = setup( 'Learning/AI' )
    await open( user )

    await user.click( label( 'Rust' ) )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Learning/Rust' )
  } )

  it( 'reports null for the default folder', async () => {
    const { user, onChange } = setup( 'Projects' )
    await open( user )

    await user.click( label( 'Mnemosyne' ) )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( null )
  } )

  it( 'offers the vault root', async () => {
    const { user, onChange } = setup()
    await open( user )

    await user.click( label( 'Vault root' ) )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( '' )
  } )
} )

describe( 'FolderPicker keyboard', () => {
  it( 'moves with the arrow keys and chooses with Enter', async () => {
    const { user, onChange } = setup( 'Mnemosyne' )
    await open( user )
    item( 'Mnemosyne' ).focus()

    await user.keyboard( '{ArrowDown}' )

    expect( item( 'Projects' ) ).toHaveFocus()

    await user.keyboard( '{Enter}' )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Projects' )
  } )

  it( 'expands a folder with ArrowRight and collapses it with ArrowLeft', async () => {
    const { user } = setup( 'Mnemosyne' )
    await open( user )
    item( 'Learning' ).focus()

    expect( item( 'Learning' ) ).toHaveAttribute( 'aria-expanded', 'false' )

    await user.keyboard( '{ArrowRight}' )

    expect( item( 'Learning' ) ).toHaveAttribute( 'aria-expanded', 'true' )
    expect( item( 'Rust' ) ).toBeInTheDocument()

    await user.keyboard( '{ArrowLeft}' )

    expect( item( 'Learning' ) ).toHaveAttribute( 'aria-expanded', 'false' )
  } )
} )

describe( 'FolderPicker filter', () => {
  it( 'shows matches with their ancestors, ignoring case', async () => {
    const { user } = setup()
    await open( user )

    await user.type( screen.getByRole( 'textbox', { name: 'Filter folders' } ), 'RUS' )

    expect( item( 'Rust' ) ).toBeInTheDocument()
    expect( item( 'Learning' ) ).toHaveAttribute( 'aria-expanded', 'true' )
    expect( screen.queryByRole( 'treeitem', { name: 'Projects' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'treeitem', { name: 'AI' } ) ).not.toBeInTheDocument()
  } )

  it( 'says when nothing matches', async () => {
    const { user } = setup()
    await open( user )

    await user.type( screen.getByRole( 'textbox', { name: 'Filter folders' } ), 'zzz' )

    expect( screen.getByText( 'No folders match' ) ).toBeInTheDocument()
  } )
} )

describe( 'FolderPicker new folder', () => {
  const create = async (
    user: ReturnType< typeof userEvent.setup >,
    name: string,
  ): Promise< void > => {
    const field = screen.getByRole( 'textbox', { name: 'New folder name' } )

    await user.clear( field )
    await user.type( field, name )
    await user.click( screen.getByRole( 'button', { name: 'New folder' } ) )
  }

  it( 'creates the folder under the chosen one, only on the client', async () => {
    const { user, onChange } = setup( 'Learning' )
    await open( user )

    await create( user, 'Notes' )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Learning/Notes' )
    expect( within( item( 'Notes' ) ).getByText( 'new' ) ).toBeInTheDocument()
  } )

  it( 'creates under the default folder when nothing is stored', async () => {
    const { user, onChange } = setup( null )
    await open( user )

    await create( user, 'Inbox' )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Mnemosyne/Inbox' )
  } )

  it( 'creates at the vault root when the root is chosen', async () => {
    const { user, onChange } = setup( '' )
    await open( user )

    await create( user, 'Top' )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Top' )
  } )

  it.each( [
    'a/b',
    '.hidden',
    '..',
    'what?',
    '   ',
    'x'.repeat( 101 ),
  ] )( 'rejects %j with a message and reports nothing', async ( name ) => {
    const { user, onChange } = setup( 'Learning' )
    await open( user )

    await create( user, name )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Folder names' )
    expect( onChange ).not.toHaveBeenCalled()
  } )

  it( 'just selects a folder that already exists there', async () => {
    const { user, onChange } = setup( 'Learning' )
    await open( user )

    await create( user, 'Rust' )

    expect( onChange ).toHaveBeenCalledExactlyOnceWith( 'Learning/Rust' )
    expect( screen.queryByText( 'new' ) ).not.toBeInTheDocument()
  } )

  it( 'clears the message after a valid name', async () => {
    const { user } = setup( 'Learning' )
    await open( user )
    await create( user, 'a/b' )

    await create( user, 'Fine' )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'FolderPicker pending destinations', () => {
  it( 'shows a stored folder that is not on disk yet as new, with its ancestors', async () => {
    const { user } = setup( 'Learning/Brand New/Deep' )
    await open( user )

    expect( item( 'Deep' ) ).toHaveAttribute( 'aria-selected', 'true' )
    expect( within( item( 'Deep' ) ).getByText( 'new' ) ).toBeInTheDocument()
    expect( within( item( 'Brand New' ) ).getAllByText( 'new' ) ).toHaveLength( 2 )
    expect( screen.getAllByText( 'new' ) ).toHaveLength( 2 )
  } )
} )
