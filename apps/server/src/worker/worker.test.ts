// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Services
import {
  failJob,
  findJob,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Repositories
import {
  clearJobs,
  insertJob,
  updateJob,
  type StoredJob,
} from '../repositories/jobStore.repository.js'
import { setModules } from '../repositories/userModules.repository.js'
import { updateUser } from '../repositories/users.repository.js'
// Worker
import { runJob } from './runJob.js'
import { startWorker } from './worker.js'
// Logging
import { logger } from '../logger.js'
import { getLogContext } from '../logContext.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( './runJob.js' )

const runJobMock = vi.mocked( runJob )

let events: string[]
let gates: Map< string, () => void >
let hold: boolean
let stopWorker: () => Promise< void >

const useRealisticRunJob = (): void => {
  runJobMock.mockImplementation( async ( owner, id ) => {
    markStatus( owner, id, 'transcribing' )
    events.push( `start:${ id }` )

    if( hold ) {
      await new Promise< void >( ( resolve ) => gates.set( id, resolve ) )
    }

    failJob( owner, id, 'x' )
    events.push( `end:${ id }` )
  } )
}

const storedJob = (): StoredJob => ( {
  id: '',
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'queued',
  error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  title: null,
  note_markdown: null,
  target_folder: null,
  expires_at: null,
  saved_path: null,
  summary_model: null,
  prompt_profile_id: null,
  source_document: null,
  link_state: null,
  link_error: null,
  source_type: 'video',
  feed_id: null,
  feed_name: null,
  gmail_source_id: null,
  gmail_source_name: null,
} )

const queue = async (): Promise< string > => {
  return ( await queueJob( userId, { url: 'https://www.youtube.com/watch?v=abc' } ) ).id
}

beforeEach( () => {
  vi.useFakeTimers()
  clearJobs( userId )
  vi.resetAllMocks()
  events = []
  gates = new Map()
  hold = false
  stopWorker = () => Promise.resolve()
  useRealisticRunJob()
} )

afterEach( async () => {
  gates.forEach( ( release ) => release() )
  await stopWorker()
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startWorker', () => {
  it( 'also picks up a job that is already summarizing', async () => {
    const id = await queue()
    updateJob( userId, id, { status: 'summarizing' } )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'runs each job inside a log context carrying its id', async () => {
    const id = await queue()
    const seen: ( string | undefined )[] = []
    const realistic = runJobMock.getMockImplementation()!
    runJobMock.mockImplementation( ( owner, jobId ) => {
      seen.push( getLogContext()?.job_id )

      return realistic( owner, jobId )
    } )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( seen ).toEqual( [ id ] )
  } )

  it( 'runs a queued job immediately', async () => {
    const id = await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'runs queued jobs oldest first', async () => {
    const first = await queue()
    const second = await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
      `end:${ second }`,
    ] )
  } )

  it( 'never runs two jobs at once', async () => {
    hold = true
    const first = await queue()
    const second = await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).toHaveBeenCalledTimes( 1 )
    expect( events ).toEqual( [ `start:${ first }` ] )

    hold = false
    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
      `end:${ second }`,
    ] )
  } )

  it( 'picks up jobs queued after it started', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( runJobMock ).not.toHaveBeenCalled()

    const id = await queue()
    await vi.advanceTimersByTimeAsync( 15_000 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'starts a job in the same tick it is queued, without waiting for the poll', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( runJobMock ).not.toHaveBeenCalled()

    const id = await queue()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'still finds a job queued by a path that does not wake it, on the 15 s poll', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    const id = crypto.randomUUID()
    insertJob( userId, { ...storedJob(), id } )

    await vi.advanceTimersByTimeAsync( 14_000 )
    expect( runJobMock ).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync( 1000 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'ignores a wake after the stop function is called', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    await stopWorker()

    await queue()
    await vi.advanceTimersByTimeAsync( 20_000 )

    expect( runJobMock ).not.toHaveBeenCalled()
  } )

  it( 'runs a job queued during a run in the same pass', async () => {
    hold = true
    const first = await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    const second = await queue()

    hold = false
    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toContain( `end:${ second }` )
  } )

  it( 'keeps going after a job throws', async () => {
    const errorSpy = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
    const broken = await queue()
    runJobMock.mockRejectedValueOnce( new Error( 'broken' ) )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( errorSpy ).toHaveBeenCalled()

    markStatus( userId, broken, 'transcribing' )
    const later = await queue()
    await vi.advanceTimersByTimeAsync( 15_000 )

    expect( runJobMock ).toHaveBeenCalledWith( userId, later )
  } )

  it( 'makes one call per pass when a job stays queued', async () => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
    const id = await queue()
    runJobMock.mockRejectedValue( new Error( 'broken' ) )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( runJobMock ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( 15_000 )

    expect( runJobMock ).toHaveBeenCalledTimes( 2 )
    expect( findJob( userId, id ).status ).toBe( 'queued' )
  } )

  it( 'stops polling after the stop function is called', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await stopWorker()
    await queue()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).not.toHaveBeenCalled()
  } )

  it( 'resolves the stop promise at once when idle', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await expect( stopWorker() ).resolves.toBeUndefined()
  } )

  it( 'resolves the stop promise only after the running job finishes', async () => {
    hold = true
    const id = await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    let stopped = false
    const stopping = stopWorker().then( () => {
      stopped = true
    } )
    await vi.advanceTimersByTimeAsync( 5000 )
    expect( stopped ).toBe( false )

    gates.get( id )?.()
    await stopping

    expect( stopped ).toBe( true )
  } )

  it( 'does not run the next job once stopped', async () => {
    hold = true
    const first = await queue()
    await queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    const stopping = stopWorker()
    gates.get( first )?.()
    await stopping
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( events ).toEqual( [ `start:${ first }`, `end:${ first }` ] )
  } )

  it( 'is safe to stop twice', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await stopWorker()

    await expect( stopWorker() ).resolves.toBeUndefined()
  } )
} )

describe( 'startWorker for two users', () => {
  // Jobs take time; the clock moves on so each start has its own stamp
  const runsTakeASecond = (): void => {
    const realistic = runJobMock.getMockImplementation()!

    runJobMock.mockImplementation( async ( owner, jobId ) => {
      await realistic( owner, jobId )
      vi.setSystemTime( Date.now() + 1000 )
    } )
  }

  it( 'runs each job for its owner, in a log context with both ids', async () => {
    const member = createTestUser().id
    const first = ( await queueJob( member, { url: 'https://www.youtube.com/watch?v=one' } ) ).id
    const second = await queue()
    const seen: ( string | undefined )[] = []
    const realistic = runJobMock.getMockImplementation()!
    runJobMock.mockImplementation( ( owner, jobId ) => {
      seen.push( getLogContext()?.user_id )

      return realistic( owner, jobId )
    } )
    runsTakeASecond()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock.mock.calls.map( ( [ owner, id ] ) => [ owner, id ] ).toSorted() )
      .toEqual( [ [ member, first ], [ userId, second ] ].toSorted() )
    expect( seen.toSorted() ).toEqual( [ member, userId ].toSorted() )
  } )

  it( 'takes turns, so one user\'s long queue does not hold up the other', async () => {
    const member = createTestUser().id
    const mine = [ await queue(), await queue(), await queue() ]
    const theirs = ( await queueJob( member, { url: 'https://www.youtube.com/watch?v=one' } ) ).id
    runsTakeASecond()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock.mock.calls.map( ( [ , id ] ) => id ) )
      .toEqual( [ mine[ 0 ], theirs, mine[ 1 ], mine[ 2 ] ] )
  } )

  it( 'leaves a job of a user without the module alone, then runs it when it is back', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } ).id
    const theirs = ( await queueJob( member, { url: 'https://www.youtube.com/watch?v=one' } ) ).id
    runsTakeASecond()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).not.toHaveBeenCalled()
    expect( findJob( member, theirs ).status ).toBe( 'queued' )

    setModules( member, [ 'transcriber' ] )
    await vi.advanceTimersByTimeAsync( 15_000 )

    expect( runJobMock.mock.calls ).toEqual( [ [ member, theirs ] ] )
  } )

  it( 'leaves a job of a removed user alone, and runs it when they are restored', async () => {
    const member = createTestUser().id
    const theirs = ( await queueJob( member, { url: 'https://www.youtube.com/watch?v=one' } ) ).id
    updateUser( member, { status: 'removed' } )
    runsTakeASecond()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).not.toHaveBeenCalled()

    updateUser( member, { status: 'active' } )
    await vi.advanceTimersByTimeAsync( 15_000 )

    expect( runJobMock.mock.calls ).toEqual( [ [ member, theirs ] ] )
  } )
} )
