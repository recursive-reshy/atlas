// Node
import {
  chmod,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Logger
import { logger } from '../logger.js'
// Melete
import { bodyHash, splitFrontMatter } from '../melete/scan.js'
import { lastSkipped, resetScanOutcome } from '../melete/scanOutcome.js'
// Repositories
import { listNotesUnder, setEnrolled, updateNote } from '../repositories/meleteNotes.repository.js'
import { listForNote } from '../repositories/meleteQuestions.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
// Worker
import { onGeneratorWake } from '../worker/wake.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import {
  CONDITIONAL_NOTE,
  GENERICS_NOTE,
  MeleteVault,
  OWNERSHIP_NOTE,
  createMeleteVault,
} from '../test-support/meleteVault.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultsPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( 'node:fs/promises', async ( importOriginal ) => {
  const actual = await importOriginal< typeof import( 'node:fs/promises' ) >()

  return { ...actual, readFile: vi.fn( actual.readFile ) }
} )
vi.mock( '../repositories/meleteNotes.repository.js', async ( importOriginal ) => {
  const actual = await importOriginal<
    typeof import( '../repositories/meleteNotes.repository.js' )
  >()

  return { ...actual, insertNote: vi.fn( actual.insertNote ) }
} )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( T0.getTime() + seconds * 1000 )

let vault: MeleteVault

const scan = ( seconds = 0 ) => scanLearningRoot( userId, { force: true, now: at( seconds ) } )

const notes = () => listNotesUnder( userId, 'Learning' )

const noteAt = ( path: string ) => {
  const found = notes().find( ( note ) => note.path === path && note.missing_at === null )

  if( found === undefined ) {
    throw new Error( `No live note at ${ path }` )
  }

  return found
}

const subjectId = ( folder: string ): string => {
  const found = listSubjects( userId ).find( ( subject ) => subject.folder === folder )

  if( found === undefined ) {
    throw new Error( `No subject ${ folder }` )
  }

  return found.id
}

const enroll = ( ...ids: string[] ): void => setEnrolled( userId, ids, true, T0.toISOString() )

const snapshot = async ( root: string ): Promise< string[] > => {
  const names = await readdir( root, { recursive: true } )
  const lines = await Promise.all( names.map( async ( name ) => {
    const { mtimeMs, size } = await stat( join( root, name ) )

    return `${ name }:${ mtimeMs }:${ size }`
  } ) )

  return lines.sort()
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  resetScanClock()
  resetScanOutcome()
  vi.mocked( readFile ).mockClear()
} )

afterEach( async () => {
  await vault.cleanup()
} )

describe( 'the first scan', () => {
  it( 'stores a subject per folder and a note per Markdown file', async () => {
    await scan()

    expect( listSubjects( userId ).map( ( { folder } ) => folder ) )
      .toEqual( [ 'Learning/Rust', 'Learning/TypeScript' ] )
    expect( notes().map( ( { path } ) => path ) ).toEqual( [
      'Learning/Rust/Ownership.md',
      'Learning/TypeScript/Advanced/Conditional Types.md',
      'Learning/TypeScript/Generics.md',
    ] )
  } )

  it( 'records title, body hash, size and modification time, and enrols nothing', async () => {
    await scan()

    const generics = noteAt( 'Learning/TypeScript/Generics.md' )
    const info = await stat( join( vault.vaultPath, generics.path ) )

    expect( generics ).toMatchObject( {
      title: 'Generics in TypeScript',
      body_hash: bodyHash( splitFrontMatter( GENERICS_NOTE ).body ),
      size: info.size,
      mtime_ms: info.mtimeMs,
      enrolled: false,
      generation: 'idle',
      missing_at: null,
      subject_id: subjectId( 'Learning/TypeScript' ),
    } )
    expect( noteAt( 'Learning/TypeScript/Advanced/Conditional Types.md' ).title )
      .toBe( 'Conditional Types' )
  } )

  it( 'ignores notes outside a subject, dot-folders and links out of the vault', async () => {
    await scan()

    const paths = notes().map( ( { path } ) => path )

    expect( paths ).not.toContain( 'Learning/Loose.md' )
    expect( paths ).not.toContain( 'Learning/TypeScript/Leak.md' )
    expect( paths.some( ( path ) => path.includes( '.trash' ) || path.includes( '.hidden' ) ) )
      .toBe( false )
    expect( listNotesUnder( userId, 'Inbox' ) ).toEqual( [] )
  } )

  it( 'writes nothing to the vault', async () => {
    const before = await snapshot( vault.vaultPath )

    await scan()
    await vault.remove( 'Learning/Rust/Ownership.md' )
    const afterChange = await snapshot( vault.vaultPath )
    await scan( 1 )

    expect( before ).not.toEqual( afterChange )
    expect( await snapshot( vault.vaultPath ) ).toEqual( afterChange )
  } )
} )

describe( 'a second scan', () => {
  it( 'does not read files whose size and modification time are unchanged', async () => {
    await scan()
    vi.mocked( readFile ).mockClear()

    await scan( 1 )

    expect( vi.mocked( readFile ) ).not.toHaveBeenCalled()
  } )

  it( 'reads a file whose size changed', async () => {
    await scan()
    vi.mocked( readFile ).mockClear()

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nMore text.\n` )
    await scan( 1 )

    expect( vi.mocked( readFile ) ).toHaveBeenCalledTimes( 1 )
  } )
} )

describe( 'a changed note', () => {
  it( 'retires the questions of an enrolled note and queues generation', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )
    enroll( note.id )
    updateNote( userId, note.id, { generation_error: 'old failure' } )
    const questionId = addQuestion( userId, note.id )

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nBorrowing too.\n` )
    await scan( 1 )

    const changed = noteAt( 'Learning/Rust/Ownership.md' )

    expect( changed ).toMatchObject( { generation: 'queued', generation_error: null } )
    expect( changed.body_hash ).not.toBe( note.body_hash )
    expect( listForNote( userId, note.id ).find( ( { id } ) => id === questionId ) ).toBeUndefined()
  } )

  it( 'only updates the hash of a note that is not enrolled', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )
    const questionId = addQuestion( userId, note.id )

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nBorrowing too.\n` )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/Ownership.md' ) ).toMatchObject( { generation: 'idle' } )
    expect( noteAt( 'Learning/Rust/Ownership.md' ).body_hash ).not.toBe( note.body_hash )
    expect( listForNote( userId, note.id ).map( ( { id, state } ) => [ id, state ] ) )
      .toEqual( [ [ questionId, 'active' ] ] )
  } )

  it( 'treats a front-matter-only change as no change to the questions', async () => {
    await scan()
    const note = noteAt( 'Learning/TypeScript/Generics.md' )
    enroll( note.id )
    updateNote( userId, note.id, { generation: 'idle' } )
    addQuestion( userId, note.id )

    await vault.write(
      'Learning/TypeScript/Generics.md',
      GENERICS_NOTE.replace( 'Generics in TypeScript', 'Generics, renamed' ),
    )
    await scan( 1 )

    const changed = noteAt( 'Learning/TypeScript/Generics.md' )

    expect( changed ).toMatchObject( {
      title: 'Generics, renamed',
      body_hash: note.body_hash,
      generation: 'idle',
    } )
    expect( listForNote( userId, note.id ) ).toHaveLength( 1 )
  } )
} )

describe( 'a moved note', () => {
  it( 'keeps its id and questions when it moves within a subject', async () => {
    await scan()
    const note = noteAt( 'Learning/TypeScript/Generics.md' )
    addQuestion( userId, note.id )

    await vault.move( 'Learning/TypeScript/Generics.md', 'Learning/TypeScript/Deep/Generics.md' )
    await scan( 1 )

    expect( noteAt( 'Learning/TypeScript/Deep/Generics.md' ).id ).toBe( note.id )
    expect( notes() ).toHaveLength( 3 )
    expect( listForNote( userId, note.id ) ).toHaveLength( 1 )
  } )

  it( 'follows a note into another subject', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.move( 'Learning/Rust/Ownership.md', 'Learning/TypeScript/Ownership.md' )
    await scan( 1 )

    expect( noteAt( 'Learning/TypeScript/Ownership.md' ) ).toMatchObject( {
      id: note.id,
      subject_id: subjectId( 'Learning/TypeScript' ),
    } )
  } )

  it( 'keeps every note when a whole subject folder is renamed', async () => {
    await scan()
    const before = notes().map( ( { id } ) => id ).sort()

    await vault.move( 'Learning/TypeScript', 'Learning/Typed' )
    await scan( 1 )

    expect( notes().map( ( { id } ) => id ).sort() ).toEqual( before )
    expect( notes().filter( ( { missing_at } ) => missing_at !== null ) ).toEqual( [] )
    expect( noteAt( 'Learning/Typed/Generics.md' ).subject_id )
      .toBe( subjectId( 'Learning/Typed' ) )
  } )

  it( 'treats an edit and a move together as a new note', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await vault.write( 'Learning/Rust/Borrowing.md', '# Borrowing\n\nA different note.\n' )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/Borrowing.md' ).id ).not.toBe( note.id )
    expect( notes().find( ( { id } ) => id === note.id )?.missing_at ).toBe( at( 1 ).toISOString() )
  } )
} )

describe( 'a missing note', () => {
  it( 'is marked missing, not deleted', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )
    addQuestion( userId, note.id )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scan( 1 )

    expect( notes().find( ( { id } ) => id === note.id ) )
      .toMatchObject( { missing_at: at( 1 ).toISOString() } )
    expect( listForNote( userId, note.id ) ).toHaveLength( 1 )
  } )

  it( 'comes back when its path reappears', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scan( 1 )
    await vault.write( 'Learning/Rust/Ownership.md', OWNERSHIP_NOTE )
    await scan( 2 )

    expect( noteAt( 'Learning/Rust/Ownership.md' ) )
      .toMatchObject( { id: note.id, missing_at: null } )
    expect( notes() ).toHaveLength( 3 )
  } )

  it( 'comes back with its questions retired when it reappears changed and enrolled', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )
    enroll( note.id )
    addQuestion( userId, note.id )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scan( 1 )
    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nEdited while away.\n` )
    await scan( 2 )

    expect( noteAt( 'Learning/Rust/Ownership.md' ) )
      .toMatchObject( { id: note.id, generation: 'queued', missing_at: null } )
    expect( listForNote( userId, note.id ) ).toEqual( [] )
  } )

  it( 'comes back when its body reappears at another path', async () => {
    await scan()
    const note = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scan( 1 )
    await vault.write( 'Learning/TypeScript/Ownership copy.md', OWNERSHIP_NOTE )
    await scan( 2 )

    expect( noteAt( 'Learning/TypeScript/Ownership copy.md' ) )
      .toMatchObject( { id: note.id, missing_at: null } )
    expect( notes() ).toHaveLength( 3 )
  } )
} )

describe( 'duplicate bodies', () => {
  it( 'adds a copy as a new note and leaves the original alone', async () => {
    await scan()
    const original = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.write( 'Learning/Rust/Ownership 2.md', OWNERSHIP_NOTE )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/Ownership.md' ).id ).toBe( original.id )
    expect( noteAt( 'Learning/Rust/Ownership 2.md' ).id ).not.toBe( original.id )
  } )

  it( 'does not call it a move when two new files share the body of a missing note', async () => {
    await scan()
    const original = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.remove( 'Learning/Rust/Ownership.md' )
    await vault.write( 'Learning/Rust/A.md', OWNERSHIP_NOTE )
    await vault.write( 'Learning/Rust/B.md', OWNERSHIP_NOTE )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/A.md' ).id ).not.toBe( original.id )
    expect( noteAt( 'Learning/Rust/B.md' ).id ).not.toBe( original.id )
    expect( notes().find( ( { id } ) => id === original.id )?.missing_at ).not.toBeNull()
  } )

  it( 'does not call it a move when two missing notes share the body', async () => {
    await vault.write( 'Learning/Rust/Twin 1.md', OWNERSHIP_NOTE )
    await vault.write( 'Learning/Rust/Twin 2.md', OWNERSHIP_NOTE )
    await scan()

    await vault.remove( 'Learning/Rust/Twin 1.md' )
    await vault.remove( 'Learning/Rust/Twin 2.md' )
    await vault.write( 'Learning/Rust/Twin 3.md', OWNERSHIP_NOTE )
    await scan( 1 )

    expect( notes().filter( ( { missing_at } ) => missing_at !== null ) ).toHaveLength( 2 )
    expect( noteAt( 'Learning/Rust/Twin 3.md' ).missing_at ).toBeNull()
  } )
} )

describe( 'auto-enrol', () => {
  it( 'enrols and queues new notes in a subject that has it on', async () => {
    await scan()
    updateSubject( userId, subjectId( 'Learning/TypeScript' ), { auto_enroll: true } )

    await vault.write(
      'Learning/TypeScript/Mapped Types.md',
      CONDITIONAL_NOTE.replace( 'Cond', 'Map' ),
    )
    await vault.write( 'Learning/Rust/Lifetimes.md', '# Lifetimes\n' )
    await scan( 1 )

    expect( noteAt( 'Learning/TypeScript/Mapped Types.md' ) ).toMatchObject( {
      enrolled: true,
      enrolled_at: at( 1 ).toISOString(),
      generation: 'queued',
    } )
    expect( noteAt( 'Learning/Rust/Lifetimes.md' ) ).toMatchObject( {
      enrolled: false,
      generation: 'idle',
    } )
    expect( noteAt( 'Learning/TypeScript/Generics.md' ).enrolled ).toBe( false )
  } )
} )

describe( 'waking the generator', () => {
  const woken = (): ( () => number ) => {
    const listener = vi.fn()
    const off = onGeneratorWake( listener )

    onTestFinished( off )

    return () => listener.mock.calls.length
  }

  it( 'wakes it in the same tick when auto-enrol queues a new note', async () => {
    await scan()
    updateSubject( userId, subjectId( 'Learning/TypeScript' ), { auto_enroll: true } )
    const wakes = woken()

    await vault.write(
      'Learning/TypeScript/Mapped Types.md',
      CONDITIONAL_NOTE.replace( 'Cond', 'Map' ),
    )
    await scan( 1 )
    await Promise.resolve()

    expect( wakes() ).toBe( 1 )
  } )

  it( 'wakes it when an enrolled note changes and is queued again', async () => {
    await scan()
    enroll( noteAt( 'Learning/Rust/Ownership.md' ).id )
    const wakes = woken()

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nBorrowing too.\n` )
    await scan( 1 )
    await Promise.resolve()

    expect( wakes() ).toBe( 1 )
  } )

  it( 'leaves it asleep when a scan queues nothing', async () => {
    await scan()
    const wakes = woken()

    await vault.write( 'Learning/Rust/Lifetimes.md', '# Lifetimes\n' )
    await scan( 1 )
    await Promise.resolve()

    expect( wakes() ).toBe( 0 )
  } )
} )

describe( 'changing the learning root', () => {
  it( 'leaves notes outside the new root alone and finds them when it changes back', async () => {
    await scan()
    const before = notes()

    setSetting( userId, 'melete_learning_root', 'Inbox' )
    await scan( 1 )

    expect( notes() ).toEqual( before )

    setSetting( userId, 'melete_learning_root', 'Learning' )
    await scan( 2 )

    expect( notes() ).toEqual( before )
  } )
} )

describe( 'when a scan is allowed', () => {
  it( 'skips a scan within 30 seconds of the last one and runs it after', async () => {
    await scanLearningRoot( userId, { now: at( 0 ) } )
    await vault.write( 'Learning/Rust/Late.md', '# Late\n' )

    await scanLearningRoot( userId, { now: at( 29 ) } )
    expect( notes().map( ( { path } ) => path ) ).not.toContain( 'Learning/Rust/Late.md' )

    await scanLearningRoot( userId, { now: at( 30 ) } )
    expect( notes().map( ( { path } ) => path ) ).toContain( 'Learning/Rust/Late.md' )
  } )

  it( 'lets force bypass the 30 seconds', async () => {
    await scanLearningRoot( userId, { now: at( 0 ) } )
    await vault.write( 'Learning/Rust/Late.md', '# Late\n' )

    await scanLearningRoot( userId, { force: true, now: at( 1 ) } )

    expect( notes().map( ( { path } ) => path ) ).toContain( 'Learning/Rust/Late.md' )
  } )

  it( 'runs one scan at a time and lets a second caller wait for it', async () => {
    await Promise.all( [ scan(), scan(), scan() ] )

    expect( vi.mocked( readFile ) ).toHaveBeenCalledTimes( 3 )
    expect( notes() ).toHaveLength( 3 )
  } )

  it( 'asks for a learning root when none is set', async () => {
    setSetting( userId, 'melete_learning_root', null )

    await expect( scan() ).rejects.toThrow( new ConflictError( 'Choose a learning root first' ) )
  } )

  it( 'refuses a learning root that is not in the vault', async () => {
    setSetting( userId, 'melete_learning_root', 'Nowhere' )

    await expect( scan() ).rejects.toThrow( ValidationError )
  } )
} )

describe( 'a failure while saving', () => {
  it( 'changes nothing and lets the next scan try again', async () => {
    const { insertNote: insert } = await import( '../repositories/meleteNotes.repository.js' )

    vi.mocked( insert ).mockImplementationOnce( () => {
      throw new Error( 'disk full' )
    } )

    await expect( scanLearningRoot( userId, { now: at( 0 ) } ) ).rejects.toThrow( 'disk full' )

    expect( listSubjects( userId ) ).toEqual( [] )
    expect( notes() ).toEqual( [] )

    await scanLearningRoot( userId, { now: at( 1 ) } )

    expect( notes() ).toHaveLength( 3 )
  } )
} )

describe( 'a file that disappears during the scan', () => {
  it( 'is left for the next scan', async () => {
    await scan()
    await writeFile( join( vault.vaultPath, 'Learning/Rust/Gone.md' ), '# Gone\n' )
    vi.mocked( readFile ).mockRejectedValueOnce(
      Object.assign( new Error( 'gone' ), { code: 'ENOENT' } ),
    )

    await scan( 1 )

    expect( notes().map( ( { path } ) => path ) ).not.toContain( 'Learning/Rust/Gone.md' )

    await scan( 2 )

    expect( notes().map( ( { path } ) => path ) ).toContain( 'Learning/Rust/Gone.md' )
  } )
} )

describe( 'scans for two users', () => {
  it( 'gives each user their own subjects and notes from the same folders', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )
    await scan()
    await scanLearningRoot( other, { force: true, now: at( 0 ) } )

    expect( listNotesUnder( other, 'Learning' ).map( ( { path } ) => path ) )
      .toEqual( notes().map( ( { path } ) => path ) )
    expect( listNotesUnder( other, 'Learning' ).map( ( { id } ) => id ) )
      .not.toEqual( notes().map( ( { id } ) => id ) )
    expect( listSubjects( other ).map( ( { folder } ) => folder ) )
      .toEqual( listSubjects( userId ).map( ( { folder } ) => folder ) )
  } )

  it( 'runs the scans of two users at once, each only once', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )
    await Promise.all( [
      scan(),
      scan(),
      scanLearningRoot( other, { force: true, now: at( 0 ) } ),
      scanLearningRoot( other, { force: true, now: at( 0 ) } ),
    ] )

    expect( vi.mocked( readFile ) ).toHaveBeenCalledTimes( 6 )
    expect( notes() ).toHaveLength( 3 )
    expect( listNotesUnder( other, 'Learning' ) ).toHaveLength( 3 )
  } )

  it( 'skips a fresh scan only for the user who just scanned', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )
    await scanLearningRoot( userId, { now: at( 0 ) } )
    await scanLearningRoot( userId, { now: at( 10 ) } )
    await scanLearningRoot( other, { now: at( 10 ) } )

    expect( listNotesUnder( other, 'Learning' ) ).toHaveLength( 3 )
    expect( vi.mocked( readFile ) ).toHaveBeenCalledTimes( 6 )
  } )

  it( 'tracks a note moved by one user without touching the other\'s copy', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )
    await scan()
    await scanLearningRoot( other, { force: true, now: at( 0 ) } )

    const mine = noteAt( 'Learning/Rust/Ownership.md' ).id

    await vault.move( 'Learning/Rust/Ownership.md', 'Learning/Rust/Moved.md' )
    await scan( 60 )

    expect( noteAt( 'Learning/Rust/Moved.md' ).id ).toBe( mine )
    expect( listNotesUnder( other, 'Learning' ).map( ( { path } ) => path ) )
      .toContain( 'Learning/Rust/Ownership.md' )
  } )
} )

describe( 'a folder or note that cannot be read', () => {
  const isRoot = process.getuid?.() === 0
  const advanced = (): string => join( vault.vaultPath, 'Learning/TypeScript/Advanced' )
  const rust = (): string => join( vault.vaultPath, 'Learning/Rust' )

  afterEach( async () => {
    await chmod( advanced(), 0o755 ).catch( () => undefined )
    await chmod( rust(), 0o755 ).catch( () => undefined )
  } )

  it.skipIf( isRoot )( 'leaves the notes under it as they were, and updates the rest', async () => {
    await scan()
    const conditional = noteAt( 'Learning/TypeScript/Advanced/Conditional Types.md' )
    enroll( conditional.id )
    const questionId = addQuestion( userId, conditional.id )

    await vault.write( 'Learning/TypeScript/Generics.md', `${ GENERICS_NOTE }\nMore.\n` )
    await chmod( advanced(), 0o000 )
    await scan( 1 )

    const kept = noteAt( 'Learning/TypeScript/Advanced/Conditional Types.md' )

    expect( kept ).toMatchObject( { missing_at: null, enrolled: true } )
    expect( kept.body_hash ).toBe( conditional.body_hash )
    expect( listForNote( userId, conditional.id ).map( ( { id } ) => id ) )
      .toEqual( [ questionId ] )
    expect( noteAt( 'Learning/TypeScript/Generics.md' ).body_hash )
      .not.toBe( bodyHash( splitFrontMatter( GENERICS_NOTE ).body ) )
    expect( lastSkipped( userId ) ).toEqual( [ 'Learning/TypeScript/Advanced' ] )
  } )

  it.skipIf( isRoot )( 'marks notes missing once the folder is readable again', async () => {
    await scan()
    await chmod( advanced(), 0o000 )
    await scan( 1 )
    await chmod( advanced(), 0o755 )
    await vault.remove( 'Learning/TypeScript/Advanced/Conditional Types.md' )
    await scan( 2 )

    expect( lastSkipped( userId ) ).toEqual( [] )
    expect( notes().find( ( { path } ) => path.endsWith( 'Conditional Types.md' ) )?.missing_at )
      .not.toBeNull()
  } )

  it.skipIf( isRoot )( 'does not treat an unreadable note as moved', async () => {
    await scan()
    const conditional = noteAt( 'Learning/TypeScript/Advanced/Conditional Types.md' )

    await chmod( advanced(), 0o000 )
    await vault.write( 'Learning/Rust/Copy.md', CONDITIONAL_NOTE )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/Copy.md' ).id ).not.toBe( conditional.id )
    expect( noteAt( 'Learning/TypeScript/Advanced/Conditional Types.md' ).id )
      .toBe( conditional.id )
  } )

  it.skipIf( isRoot )( 'counts a subject folder it cannot enter as one path', async () => {
    await scan()

    await chmod( rust(), 0o000 )
    await scan( 1 )

    expect( lastSkipped( userId ) ).toEqual( [ 'Learning/Rust' ] )
    expect( noteAt( 'Learning/Rust/Ownership.md' ).missing_at ).toBeNull()
    expect( notes().filter( ( { path } ) => path.startsWith( 'Learning/TypeScript' ) ) )
      .toHaveLength( 2 )
  } )

  it( 'skips a note it cannot read and keeps it as it was', async () => {
    await scan()
    const ownership = noteAt( 'Learning/Rust/Ownership.md' )

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nBorrowing too.\n` )
    vi.mocked( readFile ).mockRejectedValueOnce(
      Object.assign( new Error( 'denied' ), { code: 'EACCES' } ),
    )
    await scan( 1 )

    expect( noteAt( 'Learning/Rust/Ownership.md' ).body_hash ).toBe( ownership.body_hash )
    expect( lastSkipped( userId ) ).toEqual( [ 'Learning/Rust/Ownership.md' ] )
  } )

  it( 'still fails on any other read error', async () => {
    await scan()
    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nBorrowing too.\n` )
    vi.mocked( readFile ).mockRejectedValueOnce(
      Object.assign( new Error( 'io' ), { code: 'EIO' } ),
    )

    await expect( scan( 1 ) ).rejects.toThrow( 'io' )
  } )

  it( 'keeps the remembered paths when a fresh scan does not run', async () => {
    await scan()
    vi.mocked( readFile ).mockRejectedValueOnce(
      Object.assign( new Error( 'denied' ), { code: 'EACCES' } ),
    )
    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nMore.\n` )
    await scan( 1 )

    await scanLearningRoot( userId, { now: at( 2 ) } )

    expect( lastSkipped( userId ) ).toEqual( [ 'Learning/Rust/Ownership.md' ] )

    await scan( 3 )

    expect( lastSkipped( userId ) ).toEqual( [] )
  } )

  it( 'logs one warning with the paths, and none when nothing was skipped', async () => {
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    await scan()

    expect( warn ).not.toHaveBeenCalled()

    await vault.write( 'Learning/Rust/Ownership.md', `${ OWNERSHIP_NOTE }\nMore.\n` )
    vi.mocked( readFile ).mockRejectedValueOnce(
      Object.assign( new Error( 'denied' ), { code: 'EACCES' } ),
    )
    await scan( 1 )

    expect( warn ).toHaveBeenCalledTimes( 1 )
    expect( warn ).toHaveBeenCalledWith(
      {
        user_id: userId,
        learning_root: 'Learning',
        skipped_count: 1,
        skipped: [ 'Learning/Rust/Ownership.md' ],
      },
      'Scan skipped paths it could not read',
    )
  } )
} )
