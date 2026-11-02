// Node
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Clients
import {
  assertVaultWritable,
  existingFolderSync,
  isSkippable,
  listFolderTree,
  resolveExistingFolder,
  resolveFolder,
  writeNote,
} from './vault.client.js'
// Errors
import { ValidationError } from '../errors.js'

const isRoot = process.getuid?.() === 0

let vault: string

beforeEach( async () => {
  vault = await mkdtemp( join( tmpdir(), 'atlas-vault-' ) )
} )

afterEach( async () => {
  await chmod( vault, 0o755 )
  await rm( vault, { recursive: true, force: true } )
} )

describe( 'writeNote', () => {
  it( 'creates the folder and writes the note', async () => {
    const path = await writeNote( vault, 'Mnemosyne', 'What Is RAG: A Primer', '# Note\n' )

    expect( path ).toBe( 'Mnemosyne/What Is RAG A Primer.md' )
    expect( await readFile( join( vault, path ), 'utf8' ) ).toBe( '# Note\n' )
  } )

  it( 'uses an existing Mnemosyne folder', async () => {
    await mkdir( join( vault, 'Mnemosyne' ) )

    await expect( writeNote( vault, 'Mnemosyne', 'Title', 'x' ) )
      .resolves.toBe( 'Mnemosyne/Title.md' )
  } )

  it( 'never overwrites: a clash gets (2), then (3)', async () => {
    const first = await writeNote( vault, 'Mnemosyne', 'Title', 'one' )
    const second = await writeNote( vault, 'Mnemosyne', 'Title', 'two' )
    const third = await writeNote( vault, 'Mnemosyne', 'Title', 'three' )

    expect( [ first, second, third ] ).toEqual( [
      'Mnemosyne/Title.md',
      'Mnemosyne/Title (2).md',
      'Mnemosyne/Title (3).md',
    ] )
    expect( await readFile( join( vault, first ), 'utf8' ) ).toBe( 'one' )
    expect( await readFile( join( vault, third ), 'utf8' ) ).toBe( 'three' )
  } )

  it( 'skips a numbered name that already exists', async () => {
    await writeNote( vault, 'Mnemosyne', 'Title', 'one' )
    await writeFile( join( vault, 'Mnemosyne', 'Title (2).md' ), 'taken' )

    await expect( writeNote( vault, 'Mnemosyne', 'Title', 'two' ) )
      .resolves.toBe( 'Mnemosyne/Title (3).md' )
  } )

  it( 'falls back to Untitled', async () => {
    await expect( writeNote( vault, 'Mnemosyne', '???', 'x' ) )
      .resolves.toBe( 'Mnemosyne/Untitled.md' )
  } )

  it( 'creates and writes into a nested folder', async () => {
    const path = await writeNote( vault, 'Learning/AI', 'Title', 'x' )

    expect( path ).toBe( 'Learning/AI/Title.md' )
    expect( await readFile( join( vault, path ), 'utf8' ) ).toBe( 'x' )
  } )

  it( 'writes into the vault root for an empty folder', async () => {
    await expect( writeNote( vault, '', 'Title', 'x' ) ).resolves.toBe( 'Title.md' )
    expect( await readFile( join( vault, 'Title.md' ), 'utf8' ) ).toBe( 'x' )
  } )

  it( 'suffixes clashes inside a chosen folder', async () => {
    await writeNote( vault, 'Learning', 'Title', 'one' )

    await expect( writeNote( vault, 'Learning', 'Title', 'two' ) )
      .resolves.toBe( 'Learning/Title (2).md' )
  } )

  it( 'rejects a folder that leaves the vault and writes nothing', async () => {
    await expect( writeNote( vault, '../escape', 'Title', 'x' ) ).rejects.toThrow( ValidationError )
    await expect( writeNote( vault, '/etc', 'Title', 'x' ) ).rejects.toThrow( ValidationError )
    expect( await readdir( vault ) ).toEqual( [] )
  } )

  it.skipIf( isRoot )( 'propagates a permission error', async () => {
    await mkdir( join( vault, 'Mnemosyne' ) )
    await chmod( join( vault, 'Mnemosyne' ), 0o555 )

    await expect( writeNote( vault, 'Mnemosyne', 'Title', 'x' ) ).rejects.toThrow( /EACCES/ )
    expect( await readdir( join( vault, 'Mnemosyne' ) ) ).toEqual( [] )

    await chmod( join( vault, 'Mnemosyne' ), 0o755 )
  } )
} )

describe( 'resolveFolder', () => {
  let outside: string

  beforeEach( async () => {
    vault = await realpath( vault )
    outside = await mkdtemp( join( tmpdir(), 'atlas-outside-' ) )
  } )

  afterEach( async () => {
    await rm( outside, { recursive: true, force: true } )
  } )

  it( 'creates nested folders and returns the absolute path', async () => {
    const folder = await resolveFolder( vault, 'A/B/C' )

    expect( folder ).toBe( join( vault, 'A', 'B', 'C' ) )
    expect( ( await stat( folder ) ).isDirectory() ).toBe( true )
  } )

  it( 'returns the vault itself for the root', async () => {
    await expect( resolveFolder( vault, '' ) ).resolves.toBe( vault )
  } )

  it( 'reuses an existing folder', async () => {
    await mkdir( join( vault, 'Learning' ) )
    await writeFile( join( vault, 'Learning', 'keep.md' ), 'x' )

    await resolveFolder( vault, 'Learning' )

    expect( await readdir( join( vault, 'Learning' ) ) ).toEqual( [ 'keep.md' ] )
  } )

  it.each( [ '..', '../x', 'a/../../x', '/etc', '/a', 'a/', '.obsidian', 'a//b' ] )(
    'rejects %j and creates nothing',
    async ( folder ) => {
      await expect( resolveFolder( vault, folder ) ).rejects.toThrow( ValidationError )

      expect( await readdir( vault ) ).toEqual( [] )
      expect( await readdir( outside ) ).toEqual( [] )
    },
  )

  it( 'rejects a symlink that points outside the vault', async () => {
    await symlink( outside, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link' ) ).rejects.toThrow( ValidationError )
  } )

  it( 'rejects a new folder below a symlinked ancestor that points outside', async () => {
    await symlink( outside, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link/new/deeper' ) ).rejects.toThrow( ValidationError )
    expect( await readdir( outside ) ).toEqual( [] )
  } )

  it( 'allows a symlink that points to another folder inside the vault', async () => {
    await mkdir( join( vault, 'real' ) )
    await symlink( join( vault, 'real' ), join( vault, 'alias' ) )

    await expect( resolveFolder( vault, 'alias/sub' ) )
      .resolves.toBe( join( vault, 'real', 'sub' ) )
  } )

  it( 'refuses a folder whose name is taken by a file', async () => {
    await writeFile( join( vault, 'Learning' ), 'x' )

    await expect( resolveFolder( vault, 'Learning' ) )
      .rejects.toThrow( new ValidationError( 'A file is in the way of folder "Learning"' ) )
  } )

  it( 'refuses a folder below a file', async () => {
    await writeFile( join( vault, 'Learning' ), 'x' )

    await expect( resolveFolder( vault, 'Learning/Sub' ) )
      .rejects.toThrow( new ValidationError( 'A file is in the way of folder "Learning/Sub"' ) )
  } )

  it( 'rejects a sibling folder that merely shares the vault name as a prefix', async () => {
    const sibling = `${ vault }-sibling`
    await mkdir( sibling )
    await symlink( sibling, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link' ) ).rejects.toThrow( ValidationError )

    await rm( sibling, { recursive: true, force: true } )
  } )
} )

describe( 'listFolderTree', () => {
  it( 'returns an empty list for an empty vault', async () => {
    await expect( listFolderTree( vault ) ).resolves.toEqual( [] )
  } )

  it( 'lists directories only, nested, with vault-relative paths', async () => {
    await mkdir( join( vault, 'Learning', 'AI' ), { recursive: true } )
    await mkdir( join( vault, 'Learning', 'Rust' ) )
    await writeFile( join( vault, 'Learning', 'note.md' ), 'x' )
    await writeFile( join( vault, 'root.md' ), 'x' )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      {
        name: 'Learning',
        path: 'Learning',
        children: [
          { name: 'AI', path: 'Learning/AI', children: [] },
          { name: 'Rust', path: 'Learning/Rust', children: [] },
        ],
      },
    ] )
  } )

  it( 'skips dot-folders at every level', async () => {
    await mkdir( join( vault, '.obsidian' ) )
    await mkdir( join( vault, '.trash', 'x' ), { recursive: true } )
    await mkdir( join( vault, 'A', '.git' ), { recursive: true } )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      { name: 'A', path: 'A', children: [] },
    ] )
  } )

  it( 'does not follow or list symlinks', async () => {
    const outside = await mkdtemp( join( tmpdir(), 'atlas-outside-' ) )
    await mkdir( join( outside, 'secret' ) )
    await mkdir( join( vault, 'Real' ) )
    await symlink( outside, join( vault, 'link' ) )
    await symlink( join( vault, 'Real' ), join( vault, 'alias' ) )
    await writeFile( join( vault, 'file.md' ), 'x' )
    await symlink( join( vault, 'file.md' ), join( vault, 'filelink' ) )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      { name: 'Real', path: 'Real', children: [] },
    ] )

    await rm( outside, { recursive: true, force: true } )
  } )

  it( 'sorts case-insensitively at every level', async () => {
    for( const name of [ 'beta', 'Alpha', 'gamma', 'Delta' ] ) {
      await mkdir( join( vault, name ) )
    }
    for( const name of [ 'b', 'A', 'c' ] ) {
      await mkdir( join( vault, 'gamma', name ) )
    }

    const tree = await listFolderTree( vault )

    expect( tree.map( ( { name } ) => name ) ).toEqual( [ 'Alpha', 'beta', 'Delta', 'gamma' ] )
    expect( tree[ 3 ]?.children.map( ( { name } ) => name ) ).toEqual( [ 'A', 'b', 'c' ] )
  } )

  describe( 'with a folder that cannot be read', () => {
    afterEach( async () => {
      await chmod( join( vault, 'Locked' ), 0o755 ).catch( () => undefined )
    } )

    it.skipIf( isRoot )( 'lists the readable siblings and reports the bad folder', async () => {
      await mkdir( join( vault, 'Locked' ) )
      await mkdir( join( vault, 'Open', 'Inner' ), { recursive: true } )
      await chmod( join( vault, 'Locked' ), 0o000 )

      const onSkip = vi.fn()

      await expect( listFolderTree( vault, '', onSkip ) ).resolves.toEqual( [
        { name: 'Locked', path: 'Locked', children: [] },
        {
          name: 'Open',
          path: 'Open',
          children: [ { name: 'Inner', path: 'Open/Inner', children: [] } ],
        },
      ] )
      expect( onSkip ).toHaveBeenCalledTimes( 1 )
      expect( onSkip ).toHaveBeenCalledWith( 'Locked', 'EACCES' )
    } )

    it.skipIf( isRoot )( 'costs only the subtree of a nested unreadable folder', async () => {
      await mkdir( join( vault, 'Locked', 'Deep' ), { recursive: true } )
      await mkdir( join( vault, 'Other' ) )
      await chmod( join( vault, 'Locked' ), 0o000 )

      const onSkip = vi.fn()
      const tree = await listFolderTree( vault, '', onSkip )

      expect( tree.map( ( { name } ) => name ) ).toEqual( [ 'Locked', 'Other' ] )
      expect( onSkip ).toHaveBeenCalledWith( 'Locked', 'EACCES' )
    } )

    it.skipIf( isRoot )( 'skips quietly when no callback is given', async () => {
      await mkdir( join( vault, 'Locked' ) )
      await chmod( join( vault, 'Locked' ), 0o000 )

      await expect( listFolderTree( vault ) ).resolves.toEqual( [
        { name: 'Locked', path: 'Locked', children: [] },
      ] )
    } )

    it( 'still throws when the root cannot be read', async () => {
      const onSkip = vi.fn()

      await expect( listFolderTree( join( vault, 'missing' ), '', onSkip ) )
        .rejects.toThrow( /ENOENT/ )
      expect( onSkip ).not.toHaveBeenCalled()
    } )
  } )
} )

describe( 'isSkippable', () => {
  it.each( [ 'EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'ELOOP' ] )( 'is true for %s', ( code ) => {
    expect( isSkippable( Object.assign( new Error( code ), { code } ) ) ).toBe( true )
  } )

  it.each( [ 'EIO', 'EMFILE', 'ENAMETOOLONG' ] )( 'is false for %s', ( code ) => {
    expect( isSkippable( Object.assign( new Error( code ), { code } ) ) ).toBe( false )
  } )

  it( 'is false for an error without a code and for a non-error', () => {
    expect( isSkippable( new Error( 'x' ) ) ).toBe( false )
    expect( isSkippable( 'EACCES' ) ).toBe( false )
    expect( isSkippable( undefined ) ).toBe( false )
  } )
} )

describe( 'assertVaultWritable', () => {
  it( 'passes for a writable folder', async () => {
    await expect( assertVaultWritable( vault ) ).resolves.toBeUndefined()
  } )

  it( 'names the path when the folder does not exist', async () => {
    const missing = join( vault, 'nope' )

    await expect( assertVaultWritable( missing ) ).rejects.toThrow( `VAULTS_PATH ${ missing }` )
  } )

  it( 'rejects a path that is a file', async () => {
    const file = join( vault, 'file.txt' )
    await writeFile( file, 'x' )

    await expect( assertVaultWritable( file ) ).rejects.toThrow( 'is not a folder' )
  } )

  it.skipIf( isRoot )( 'rejects a read-only folder', async () => {
    await chmod( vault, 0o555 )

    await expect( assertVaultWritable( vault ) ).rejects.toThrow( 'is not writable' )
  } )
} )

describe( 'resolveExistingFolder', () => {
  it( 'returns the real path of a folder that exists', async () => {
    await mkdir( join( vault, 'Learning/TypeScript' ), { recursive: true } )

    expect( await resolveExistingFolder( vault, 'Learning/TypeScript' ) )
      .toBe( join( await realpath( vault ), 'Learning/TypeScript' ) )
  } )

  it( 'refuses a missing folder and creates nothing', async () => {
    await expect( resolveExistingFolder( vault, 'Learning/Missing' ) )
      .rejects.toThrow( new ValidationError( 'Folder doesn\'t exist in the vault' ) )

    expect( await readdir( vault ) ).toEqual( [] )
  } )

  it( 'refuses a file where a folder is expected', async () => {
    await writeFile( join( vault, 'note.md' ), 'x' )

    await expect( resolveExistingFolder( vault, 'note.md' ) ).rejects.toThrow( ValidationError )
  } )

  it( 'refuses a path that escapes the vault', async () => {
    await expect( resolveExistingFolder( vault, '../elsewhere' ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'refuses a link that leads out of the vault', async () => {
    const outside = await mkdtemp( join( tmpdir(), 'atlas-outside-' ) )

    try {
      await symlink( outside, join( vault, 'Escape' ) )

      await expect( resolveExistingFolder( vault, 'Escape' ) )
        .rejects.toThrow( new ValidationError( 'Folder "Escape" is outside the vault' ) )
    } finally {
      await rm( outside, { recursive: true, force: true } )
    }
  } )

  it( 'accepts the vault root', async () => {
    expect( await resolveExistingFolder( vault, '' ) ).toBe( await realpath( vault ) )
  } )
} )

describe( 'existingFolderSync', () => {
  it( 'is true for a folder that exists, nested or the vault root', async () => {
    await mkdir( join( vault, 'Learning/TypeScript' ), { recursive: true } )

    expect( existingFolderSync( vault, 'Learning/TypeScript' ) ).toBe( true )
    expect( existingFolderSync( vault, 'Learning' ) ).toBe( true )
    expect( existingFolderSync( vault, '' ) ).toBe( true )
  } )

  it( 'is false for a missing folder and creates nothing', async () => {
    expect( existingFolderSync( vault, 'Learning/Missing' ) ).toBe( false )
    expect( await readdir( vault ) ).toEqual( [] )
  } )

  it( 'is false for a file, an invalid path and a path that escapes the vault', async () => {
    await writeFile( join( vault, 'note.md' ), 'x' )

    expect( existingFolderSync( vault, 'note.md' ) ).toBe( false )
    expect( existingFolderSync( vault, 'a//b' ) ).toBe( false )
    expect( existingFolderSync( vault, '../elsewhere' ) ).toBe( false )
  } )

  it( 'is false for a link that leads out of the vault', async () => {
    const outside = await mkdtemp( join( tmpdir(), 'atlas-outside-' ) )

    try {
      await symlink( outside, join( vault, 'Escape' ) )

      expect( existingFolderSync( vault, 'Escape' ) ).toBe( false )
    } finally {
      await rm( outside, { recursive: true, force: true } )
    }
  } )
} )
