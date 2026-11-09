// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { findNote, updateNote } from '../repositories/meleteNotes.repository.js'
import { findSubject, updateSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { generateForNote } from '../services/meleteGeneration.service.js'
import { mapForNote } from '../services/meleteMapping.service.js'
import { draftForSubject } from '../services/meleteSyllabus.service.js'
// Worker
import { startMeleteGenerator } from './meleteGenerator.js'
// Logging
import { logger } from '../logger.js'
import { getLogContext } from '../logContext.js'
// Test support
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../services/meleteGeneration.service.js' )
vi.mock( '../services/meleteMapping.service.js' )
vi.mock( '../services/meleteSyllabus.service.js' )

const generateMock = vi.mocked( generateForNote )
const draftMock = vi.mocked( draftForSubject )
const mapMock = vi.mocked( mapForNote )

let events: string[]
let gates: Map< string, () => void >
let hold: boolean
let seenContexts: ( string | undefined )[]
let seenSubjectContexts: ( string | undefined )[]
let stopGenerator: () => Promise< void >
let subjectId: string

const queued = ( enrolledAt: string ): string => {
  return addNote( userId, subjectId, { generation: 'queued', enrolledAt } )
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  events = []
  gates = new Map()
  hold = false
  seenContexts = []
  seenSubjectContexts = []
  stopGenerator = () => Promise.resolve()
  subjectId = addSubject( userId )
  draftMock.mockImplementation( ( _owner, id ) => {
    events.push( `draft:${ id }` )
    seenSubjectContexts.push( getLogContext()?.melete_subject_id )
    updateSubject( userId, id, { syllabus_status: 'draft' } )

    return Promise.resolve()
  } )
  mapMock.mockImplementation( ( _owner, id ) => {
    events.push( `map:${ id }` )
    updateNote( userId, id, { mapping: 'idle' } )

    return Promise.resolve()
  } )
  generateMock.mockImplementation( async ( _owner, id ) => {
    events.push( `start:${ id }` )
    seenContexts.push( getLogContext()?.melete_note_id )

    if( hold ) {
      await new Promise< void >( ( resolve ) => gates.set( id, resolve ) )
    }

    updateNote( userId, id, { generation: 'idle' } )
    events.push( `end:${ id }` )
  } )
} )

afterEach( async () => {
  gates.forEach( ( release ) => release() )
  await stopGenerator()
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startMeleteGenerator', () => {
  it( 'generates a queued note immediately', async () => {
    const id = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
  } )

  it( 'generates queued notes oldest enrolled first, one at a time', async () => {
    const later = queued( '2026-10-02T00:00:00.000Z' )
    const earlier = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ earlier }`,
      `end:${ earlier }`,
      `start:${ later }`,
      `end:${ later }`,
    ] )
  } )

  it( 'does not overlap passes while a note is still generating', async () => {
    hold = true
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( events ).toEqual( [ `start:${ first }` ] )

    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
    ] )
  } )

  it( 'picks up a note queued later on the next poll', async () => {
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( generateMock ).not.toHaveBeenCalled()

    const id = queued( '2026-10-01T00:00:00.000Z' )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'leaves idle, failed and generating notes alone', async () => {
    addNote( userId, subjectId, { generation: 'idle' } )
    addNote( userId, subjectId, { generation: 'failed' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).not.toHaveBeenCalled()
  } )

  it( 'puts notes left generating by a restart back in the queue and runs them', async () => {
    const id = addNote( userId, subjectId, {
      generation: 'generating',
      enrolledAt: '2026-10-01T00:00:00.000Z',
    } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'requeues generating notes only once, at start', async () => {
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    const id = addNote( userId, subjectId, { generation: 'generating' } )

    await vi.advanceTimersByTimeAsync( 5000 )

    expect( generateMock ).not.toHaveBeenCalled()
    expect( findNote( userId, id )?.generation ).toBe( 'generating' )
  } )

  it( 'runs each note inside a log context carrying its id', async () => {
    const id = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( seenContexts ).toEqual( [ id ] )
  } )

  it( 'logs an error and carries on with the next note', async () => {
    const error = vi.spyOn( logger, 'error' )
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    generateMock.mockRejectedValueOnce( new Error( 'database is locked' ) )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( error ).toHaveBeenCalledTimes( 1 )
    expect( generateMock ).toHaveBeenNthCalledWith( 1, userId, first )
    expect( generateMock ).toHaveBeenNthCalledWith( 2, userId, second )
  } )

  it( 'stops polling and waits for the running note when stopped', async () => {
    hold = true
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    let stopped = false
    const stopping = stopGenerator().then( () => {
      stopped = true
    } )

    await vi.advanceTimersByTimeAsync( 5000 )
    expect( stopped ).toBe( false )

    gates.get( first )?.()
    await stopping
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( stopped ).toBe( true )
    expect( events ).toEqual( [ `start:${ first }`, `end:${ first }` ] )
    expect( findNote( userId, second )?.generation ).toBe( 'queued' )
  } )
} )

describe( 'startMeleteGenerator for two users', () => {
  it( 'generates each note for its owner, taking turns, in the owner\'s context', async () => {
    const other = createTestUser( { vault_dir: 'other' } ).id
    const mine = [ queued( '2026-10-02T00:00:00.000Z' ), queued( '2026-10-03T00:00:00.000Z' ) ]
    const theirs = addNote(
      other,
      addSubject( other ),
      { generation: 'queued', enrolledAt: '2026-10-01T00:00:00.000Z' },
    )
    const owners: ( string | undefined )[] = []

    // The clock is frozen, so who joined first decides when the turns tie
    getDatabase().prepare( 'UPDATE users SET created_at = ? WHERE id = ?' )
      .run( '2026-09-01T00:00:00.000Z', userId )
    getDatabase().prepare( 'UPDATE users SET created_at = ? WHERE id = ?' )
      .run( '2026-09-02T00:00:00.000Z', other )
    generateMock.mockImplementation( ( owner ) => {
      owners.push( getLogContext()?.user_id )

      return Promise.resolve( owner ).then( () => undefined )
    } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock.mock.calls )
      .toEqual( [ [ userId, mine[ 0 ] ], [ other, theirs ], [ userId, mine[ 1 ] ] ] )
    expect( owners ).toEqual( [ userId, other, userId ] )
  } )

  it( 'leaves the queue of a user with no vault alone until they choose one', async () => {
    const other = createTestUser().id
    const theirs = addNote( other, addSubject( other ), { generation: 'queued' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( generateMock ).not.toHaveBeenCalled()
    expect( findNote( other, theirs )?.generation ).toBe( 'queued' )

    getDatabase().prepare( 'UPDATE users SET vault_dir = \'chosen\' WHERE id = ?' ).run( other )
    await vi.advanceTimersByTimeAsync( 2000 )

    expect( generateMock.mock.calls ).toEqual( [ [ other, theirs ] ] )
  } )

  it( 'puts the interrupted notes of every user back in the queue', async () => {
    const other = createTestUser( { vault_dir: 'other' } ).id
    const mine = addNote( userId, subjectId, { generation: 'generating' } )
    const theirs = addNote( other, addSubject( other ), { generation: 'generating' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock.mock.calls.map( ( [ owner, id ] ) => `${ owner }:${ id }` ).sort() )
      .toEqual( [ `${ userId }:${ mine }`, `${ other }:${ theirs }` ].sort() )
  } )
} )

describe( 'startMeleteGenerator, syllabus drafts (ADR 0089)', () => {
  const drafting = ( folder = 'Learning/Data' ): string => {
    const id = addSubject( userId, folder )

    updateSubject( userId, id, { target_level: 'working', syllabus_status: 'drafting' } )

    return id
  }

  it( 'drafts a subject whose syllabus is drafting, straight away', async () => {
    const id = drafting()

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( draftMock ).toHaveBeenCalledWith( userId, id )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'draft' )
  } )

  it( 'drafts before it generates questions', async () => {
    const note = queued( '2026-10-01T00:00:00.000Z' )
    const id = drafting()

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [ `draft:${ id }`, `start:${ note }`, `end:${ note }` ] )
  } )

  it( 'picks up a subject a restart left drafting, with nothing to requeue', async () => {
    const id = drafting()

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( draftMock ).toHaveBeenCalledTimes( 1 )
    expect( draftMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'drafts a subject requested after the loop started, on the next poll', async () => {
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    const id = drafting()

    expect( draftMock ).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync( 1000 )

    expect( draftMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'tries a subject that stays drafting once per pass, not in a loop', async () => {
    const id = drafting()

    draftMock.mockImplementation( () => Promise.resolve() )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( draftMock ).toHaveBeenCalledTimes( 1 )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'drafting' )
  } )

  it( 'leaves subjects that are not drafting alone', async () => {
    updateSubject( userId, subjectId, { syllabus_status: 'approved' } )
    addSubject( userId, 'Learning/Other' )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( draftMock ).not.toHaveBeenCalled()
  } )

  it( 'runs each draft inside a log context carrying the subject id', async () => {
    const id = drafting()

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( seenSubjectContexts ).toEqual( [ id ] )
  } )

  it( 'logs an error and carries on with the notes when a draft throws', async () => {
    const error = vi.spyOn( logger, 'error' )
    const note = queued( '2026-10-01T00:00:00.000Z' )

    drafting()
    draftMock.mockRejectedValueOnce( new Error( 'database is locked' ) )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( error ).toHaveBeenCalledTimes( 1 )
    expect( generateMock ).toHaveBeenCalledWith( userId, note )
  } )
} )

describe( 'mapping in the Melete loop', () => {
  const queuedMapping = ( enrolledAt: string ): string => {
    return addNote( userId, subjectId, { mapping: 'queued', enrolledAt } )
  }

  it( 'maps a note queued for mapping, inside a log context carrying its id', async () => {
    const id = queuedMapping( '2026-10-01T00:00:00.000Z' )

    mapMock.mockImplementation( ( _owner, noteId ) => {
      seenContexts.push( getLogContext()?.melete_note_id )
      updateNote( userId, noteId, { mapping: 'idle' } )

      return Promise.resolve()
    } )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( mapMock ).toHaveBeenCalledWith( userId, id )
    expect( seenContexts ).toEqual( [ id ] )
    expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
  } )

  it( 'drafts first, then generates, then maps', async () => {
    const mapping = queuedMapping( '2026-10-01T00:00:00.000Z' )
    const generating = queued( '2026-10-02T00:00:00.000Z' )
    const drafting = addSubject( userId, 'Learning/Other' )

    updateSubject( userId, drafting, { syllabus_status: 'drafting' } )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `draft:${ drafting }`,
      `start:${ generating }`,
      `end:${ generating }`,
      `map:${ mapping }`,
    ] )
  } )

  it( 'waits to map a note that is still queued for its questions', async () => {
    const id = addNote( userId, subjectId, { generation: 'queued', mapping: 'queued' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [ `start:${ id }`, `end:${ id }`, `map:${ id }` ] )
  } )

  it( 'puts notes left mapping by a restart back in the queue and maps them', async () => {
    const id = addNote( userId, subjectId, { mapping: 'mapping' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( mapMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'logs an error from mapping and carries on with the next note', async () => {
    const error = vi.spyOn( logger, 'error' )
    const first = queuedMapping( '2026-10-01T00:00:00.000Z' )
    const second = queuedMapping( '2026-10-02T00:00:00.000Z' )

    mapMock.mockRejectedValueOnce( new Error( 'database is locked' ) )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( error ).toHaveBeenCalledTimes( 1 )
    expect( mapMock ).toHaveBeenNthCalledWith( 1, userId, first )
    expect( mapMock ).toHaveBeenNthCalledWith( 2, userId, second )
  } )

  it( 'leaves idle and failed mapping alone', async () => {
    addNote( userId, subjectId, { mapping: 'idle' } )
    addNote( userId, subjectId, { mapping: 'failed' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( mapMock ).not.toHaveBeenCalled()
  } )
} )

