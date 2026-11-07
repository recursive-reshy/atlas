// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Test support
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import {
  findMissingByHash,
  findNote,
  insertNote,
  listNotesBySubject,
  listNotesUnder,
  setEnrolled,
  updateNote,
} from './meleteNotes.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const MISSING = '2026-10-22T00:00:00.000Z'
const AT = '2026-10-22T09:00:00.000Z'

const newNote = ( subjectId: string, path = 'Learning/TypeScript/Generics.md' ) => ( {
  subject_id: subjectId,
  path,
  title: 'Generics',
  body_hash: 'abc',
  mtime_ms: 1_700_000_000_000,
  size: 120,
  enrolled: false,
  enrolled_at: null,
  generation: 'idle' as const,
} )

describe( 'insertNote and findNote', () => {
  it( 'stores a note and reads it back', () => {
    const subjectId = addSubject( userId )
    const note = insertNote( userId, newNote( subjectId ) )

    expect( note ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      subject_id: subjectId,
      path: 'Learning/TypeScript/Generics.md',
      title: 'Generics',
      body_hash: 'abc',
      mtime_ms: 1_700_000_000_000,
      size: 120,
      enrolled: false,
      enrolled_at: null,
      generation: 'idle',
      generation_error: null,
      missing_at: null,
      mapping: 'idle',
      mapping_error: null,
      mapping_pinned: false,
      off_syllabus: null,
      off_syllabus_suggestion: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( findNote( userId, note.id ) ).toEqual( note )
  } )

  it( 'stores an enrolled, queued note', () => {
    const note = insertNote( userId, {
      ...newNote( addSubject( userId ) ),
      enrolled: true,
      enrolled_at: '2026-10-22T00:00:00.000Z',
      generation: 'queued',
    } )

    expect( note ).toMatchObject( {
      enrolled: true,
      enrolled_at: '2026-10-22T00:00:00.000Z',
      generation: 'queued',
    } )
  } )

  it( 'refuses a second live note at the same path', () => {
    const subjectId = addSubject( userId )

    insertNote( userId, newNote( subjectId ) )

    expect( () => insertNote( userId, newNote( subjectId ) ) ).toThrow()
  } )

  it( 'returns undefined for an unknown note', () => {
    expect( findNote( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'listNotesBySubject', () => {
  it( 'lists a subject\'s notes by path, missing ones included', () => {
    const subjectId = addSubject( userId )
    const otherId = addSubject( userId, 'Learning/Rust' )

    addNote( userId, subjectId, { path: 'Learning/TypeScript/b.md' } )
    addNote( userId, subjectId, { path: 'Learning/TypeScript/a.md', missingAt: MISSING } )
    addNote( userId, otherId, { path: 'Learning/Rust/c.md' } )

    expect( listNotesBySubject( userId, subjectId )
      .map( ( { path, missing_at } ) => [ path, missing_at !== null ] ) )
      .toEqual( [
        [ 'Learning/TypeScript/a.md', true ],
        [ 'Learning/TypeScript/b.md', false ],
      ] )
  } )
} )

describe( 'listNotesUnder', () => {
  it( 'lists notes whose path is inside the folder, missing ones included', () => {
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { path: 'Learning/TS/a.md' } )
    addNote(
      userId,
      subjectId,
      { path: 'Learning/TS/deep/b.md', missingAt: '2026-10-22T00:00:00.000Z' },
    )

    expect( listNotesUnder( userId, 'Learning/TS' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/TS/a.md', 'Learning/TS/deep/b.md' ] )
  } )

  it( 'does not match a sibling folder that starts with the same letters', () => {
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { path: 'Learning/TSX/a.md' } )
    addNote( userId, subjectId, { path: 'Learning/TS/b.md' } )

    expect( listNotesUnder( userId, 'Learning/TS' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/TS/b.md' ] )
  } )

  it( 'treats % and _ in a folder name literally', () => {
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { path: 'Learning/100%/a.md' } )
    addNote( userId, subjectId, { path: 'Learning/100x/b.md' } )

    expect( listNotesUnder( userId, 'Learning/100%' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/100%/a.md' ] )
  } )
} )

describe( 'updateNote', () => {
  it( 'changes only the given fields', () => {
    const id = addNote(
      userId,
      addSubject( userId ),
      { path: 'Learning/TypeScript/a.md', enrolled: false },
    )

    const updated = updateNote( userId, id, {
      title: 'New title',
      body_hash: 'new',
      mtime_ms: 5,
      size: 9,
      generation: 'queued',
      generation_error: 'Old error',
    } )

    expect( updated ).toMatchObject( {
      path: 'Learning/TypeScript/a.md',
      title: 'New title',
      body_hash: 'new',
      mtime_ms: 5,
      size: 9,
      generation: 'queued',
      generation_error: 'Old error',
      enrolled: false,
    } )
  } )

  it( 'moves a note and sets or clears missing_at', () => {
    const subjectId = addSubject( userId )
    const otherId = addSubject( userId, 'Learning/Rust' )
    const id = addNote( userId, subjectId, { path: 'Learning/TypeScript/a.md' } )

    expect( updateNote( userId, id, { missing_at: '2026-10-22T00:00:00.000Z' } )?.missing_at )
      .toBe( '2026-10-22T00:00:00.000Z' )
    expect( updateNote( userId, id, {
      path: 'Learning/Rust/a.md',
      subject_id: otherId,
      missing_at: null,
    } ) )
      .toMatchObject( { path: 'Learning/Rust/a.md', subject_id: otherId, missing_at: null } )
  } )

  it( 'clears the generation error with null', () => {
    const id = addNote( userId, addSubject( userId ) )

    updateNote( userId, id, { generation: 'failed', generation_error: 'Boom' } )

    expect( updateNote( userId, id, { generation: 'queued', generation_error: null } ) )
      .toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it( 'returns undefined for an unknown note and ignores an empty change', () => {
    expect( updateNote( userId, crypto.randomUUID(), { title: 'x' } ) ).toBeUndefined()

    const id = addNote( userId, addSubject( userId ) )

    expect( updateNote( userId, id, {} ) ).toEqual( findNote( userId, id ) )
  } )
} )

describe( 'findMissingByHash', () => {
  it( 'returns only missing notes with that hash', () => {
    const subjectId = addSubject( userId )
    const gone = addNote(
      userId,
      subjectId,
      { hash: 'same', missingAt: '2026-10-22T00:00:00.000Z' },
    )

    addNote( userId, subjectId, { hash: 'same' } )
    addNote( userId, subjectId, { hash: 'other', missingAt: '2026-10-22T00:00:00.000Z' } )

    expect( findMissingByHash( userId, 'same' ).map( ( { id } ) => id ) ).toEqual( [ gone ] )
    expect( findMissingByHash( userId, 'nothing' ) ).toEqual( [] )
  } )
} )

describe( 'setEnrolled', () => {
  it( 'enrolls several notes at one time', () => {
    const subjectId = addSubject( userId )
    const a = addNote( userId, subjectId, { enrolled: false } )
    const b = addNote( userId, subjectId, { enrolled: false } )
    const c = addNote( userId, subjectId, { enrolled: false } )

    setEnrolled( userId, [ a, b ], true, AT )

    expect( findNote( userId, a ) ).toMatchObject( { enrolled: true, enrolled_at: AT } )
    expect( findNote( userId, b ) ).toMatchObject( { enrolled: true, enrolled_at: AT } )
    expect( findNote( userId, c ) ).toMatchObject( { enrolled: false, enrolled_at: null } )
  } )

  it( 'unenrolls without losing when it was enrolled', () => {
    const id = addNote(
      userId,
      addSubject( userId ),
      { enrolled: true, enrolledAt: '2026-10-01T00:00:00.000Z' },
    )

    setEnrolled( userId, [ id ], false, '2026-10-22T09:00:00.000Z' )

    expect( findNote( userId, id ) )
      .toMatchObject( { enrolled: false, enrolled_at: '2026-10-01T00:00:00.000Z' } )
  } )

  it( 'does nothing for no ids', () => {
    expect( () => setEnrolled( userId, [], true, '2026-10-22T09:00:00.000Z' ) ).not.toThrow()
  } )
} )

describe( 'ownership', () => {
  it( 'lets two users track a note at the same path and body', () => {
    const other = createTestUser().id
    const note = {
      path: 'Learning/TypeScript/Generics.md',
      title: 'Generics',
      body_hash: 'same',
      mtime_ms: 1,
      size: 1,
      enrolled: false,
      enrolled_at: null,
      generation: 'idle' as const,
    }

    insertNote( userId, { ...note, subject_id: addSubject( userId ) } )

    expect( () => insertNote( other, { ...note, subject_id: addSubject( other ) } ) )
      .not.toThrow()
    expect( () => insertNote( userId, { ...note, subject_id: addSubject( userId, 'Other' ) } ) )
      .toThrow( /UNIQUE/ )
  } )

  it( 'does not show, list, change or enrol another user\'s notes', () => {
    const other = createTestUser().id
    const subjectId = addSubject( userId )
    const id = addNote( userId, subjectId, { path: 'Learning/TypeScript/A.md', enrolled: false } )

    expect( findNote( other, id ) ).toBeUndefined()
    expect( listNotesBySubject( other, subjectId ) ).toEqual( [] )
    expect( listNotesUnder( other, 'Learning/TypeScript' ) ).toEqual( [] )
    expect( updateNote( other, id, { title: 'Stolen' } ) ).toBeUndefined()

    setEnrolled( other, [ id ], true, '2026-10-22T09:00:00.000Z' )

    expect( findNote( userId, id ) ).toMatchObject( { title: 'Title', enrolled: false } )
  } )

  it( 'only finds a missing note by its hash for its owner', () => {
    const other = createTestUser().id

    addNote( userId, addSubject( userId ), {
      hash: 'h',
      missingAt: '2026-10-22T09:00:00.000Z',
    } )

    expect( findMissingByHash( userId, 'h' ) ).toHaveLength( 1 )
    expect( findMissingByHash( other, 'h' ) ).toEqual( [] )
  } )
} )

describe( 'updateNote, the mapping fields', () => {
  it( 'sets and clears the mapping state, error and pin', () => {
    const id = addNote( userId, addSubject( userId ) )

    expect( updateNote( userId, id, { mapping: 'failed', mapping_error: 'Bad output' } ) )
      .toMatchObject( { mapping: 'failed', mapping_error: 'Bad output', mapping_pinned: false } )
    expect( updateNote( userId, id, {
      mapping: 'queued',
      mapping_error: null,
      mapping_pinned: true,
    } ) )
      .toMatchObject( { mapping: 'queued', mapping_error: null, mapping_pinned: true } )
    expect( updateNote( userId, id, { mapping_pinned: false } )?.mapping_pinned ).toBe( false )
  } )

  it( 'flags a note off-syllabus with a suggestion, then clears it', () => {
    const id = addNote( userId, addSubject( userId ) )

    expect( updateNote( userId, id, {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Joins',
    } ) )
      .toMatchObject( { off_syllabus: 'flagged', off_syllabus_suggestion: 'Joins' } )
    expect( updateNote( userId, id, { off_syllabus: 'dismissed' } ) )
      .toMatchObject( { off_syllabus: 'dismissed', off_syllabus_suggestion: 'Joins' } )
    expect( updateNote( userId, id, { off_syllabus: null, off_syllabus_suggestion: null } ) )
      .toMatchObject( { off_syllabus: null, off_syllabus_suggestion: null } )
  } )
} )
