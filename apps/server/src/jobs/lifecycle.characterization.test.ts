// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import {
  ArticleSource,
  JobStatus,
  SourceDocument,
  SourceType,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError } from '../errors.js'
// Repositories
import {
  clearJobs,
  findJobById,
  insertJob,
  updateJob,
} from '../repositories/jobStore.repository.js'
// Services
import {
  completeAcquisition,
  completeSummary,
  deleteExpiredJobs,
  failJob,
  failSummary,
  claimNextJob,
  listJobs,
  markStatus,
  recoverInterruptedJobs,
  regenerateSummary,
  retrySummary,
} from '../services/jobs.service.js'
import {
  acceptSuggestions,
  completeLinking,
  failLinking,
  rejectSuggestions,
  runLinking,
} from '../services/jobLinking.service.js'
import {
  discardJob,
  saveJob,
  submitPastedText,
  updateDraft,
} from '../services/jobDraft.service.js'
import { findSource } from '../services/jobRender.service.js'
// Clients
import { writeNote } from '../clients/vault.client.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

// Characterization of the 0.7.0 job lifecycle (ADR 0048, TRD §2.4). Every service function is
// driven from every status and source, and the moves that succeed are listed below; any move
// that is not listed must give a ConflictError. This file pins today's behaviour and stays in
// the suite unchanged through the refactor.

vi.mock( '../clients/vault.client.js' )

const writeNoteMock = vi.mocked( writeNote )

const startTime = new Date( '2026-10-14T10:00:00.000Z' )
const seededExpiry = '2026-10-15T00:00:00.000Z'
const staleExpiry = '2026-10-13T00:00:00.000Z'
const HOUR_MS = 3_600_000
const SAMPLE_UUID = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

const STATUSES = JobStatus.options
const SOURCES = SourceType.options

const videoDocument: SourceDocument = { kind: 'video', ...transcriptFixture }
const articleDocument: ArticleSource = {
  kind: 'article',
  meta: {
    title: 'A post',
    source: 'https://example.com/post',
    author: null,
    site: 'Example',
    published: null,
    fetched_at: '2026-10-14T09:00:00.000Z',
    origin: 'fetched',
  },
  markdown: 'Some text.',
}

const documentFor = ( source: SourceType ): SourceDocument => {
  return source === 'video' ? videoDocument : articleDocument
}

const reviewStates: JobStatus[] = [ 'ready_for_review', 'summary_failed' ]

// What a job looks like in each status, as the 0.7.0 services leave it
const seed = ( status: JobStatus, source: SourceType, id = crypto.randomUUID() ): string => {
  const document = documentFor( source )
  const hasDraft = [ 'linking', 'ready_for_review', 'saved' ].includes( status )
  const linkState = status === 'linking'
    ? 'pending'
    : status === 'ready_for_review' ? 'off' : null

  insertJob( userId, {
    id,
    url: document.meta.source,
    status,
    error: status === 'failed' || status === 'summary_failed' ? 'earlier failure' : null,
    created_at: startTime.toISOString(),
    updated_at: startTime.toISOString(),
    title: document.meta.title,
    note_markdown: hasDraft
      ? formatNote( {
        title: document.meta.title,
        tags: [],
        body: '## Summary',
        document,
        created: '2026-10-14',
      } )
      : null,
    target_folder: null,
    expires_at: reviewStates.includes( status ) ? seededExpiry : null,
    saved_path: null,
    summary_model: null,
    prompt_profile_id: null,
    link_state: linkState,
    link_error: null,
    source_document: status === 'saved' ? null : document,
    source_type: source,
    feed_id: null,
    feed_name: null,
    gmail_source_id: null,
    gmail_source_name: null,
  } )

  return id
}

const freshExpiry = (): string => {
  return new Date( startTime.getTime() + config.reviewTtlHours * HOUR_MS ).toISOString()
}

const describeExpiry = ( expiresAt: string | null ): string => {
  if( expiresAt === null ) return 'null'
  if( expiresAt === seededExpiry ) return 'unchanged'
  if( expiresAt === freshExpiry() ) return 'fresh'

  return `other(${ expiresAt })`
}

const agent = { url: 'http://localhost:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }

type Op = ( id: string, source: SourceType ) => unknown

const notPending = ( run: () => unknown ): string => {
  try {
    run()
  } catch( error ) {
    // Past the status check; the missing suggestion is what stops it
    if( error instanceof ConflictError && /is not pending/.test( error.message ) ) {
      return 'status ok'
    }
    if( error instanceof ConflictError ) return '409'
  }

  return 'unexpected'
}

// The service functions that move a job, by name
const OPS: Record< string, Op > = {
  'markStatus transcribing': ( id ) => markStatus( userId, id, 'transcribing' ),
  'markStatus fetching': ( id ) => markStatus( userId, id, 'fetching' ),
  completeAcquisition: ( id, source ) => completeAcquisition( userId, id, documentFor( source ) ),
  completeSummary: ( id ) => completeSummary( userId, id, '## Summary', [] ),
  'completeSummary with linking': ( id ) => {
    config.agent = agent

    return completeSummary( userId, id, '## Summary', [] )
  },
  completeLinking: ( id ) => completeLinking( userId, id ),
  failLinking: ( id ) => failLinking( userId, id, 'agent down' ),
  failSummary: ( id ) => failSummary( userId, id, 'Claude down' ),
  retrySummary: ( id ) => retrySummary( userId, id ),
  regenerateSummary: ( id ) => regenerateSummary( userId, id, {} ),
  'runLinking without an agent': ( id ) => runLinking( userId, id, {} ),
  'runLinking': ( id ) => {
    config.agent = agent

    return runLinking( userId, id, {} )
  },
  submitPastedText: ( id ) => submitPastedText(
    userId,
    id,
    { text: 'Pasted words. '.repeat( 20 ) },
  ),
  failJob: ( id ) => failJob( userId, id, 'boom' ),
  updateDraft: ( id ) => updateDraft( userId, id, { target_folder: 'Notes' } ),
  saveJob: ( id ) => saveJob( userId, id ),
  discardJob: ( id ) => discardJob( userId, id ),
  findSource: ( id ) => findSource( userId, id ),
}

type Outcome = string
type Matrix = Record< string, Outcome >

const key = ( source: SourceType, status: JobStatus ): string => `${ source } ${ status }`

const run = async ( name: string ): Promise< Matrix > => {
  const matrix: Matrix = {}
  const op = OPS[ name ]

  for( const source of SOURCES ) {
    for( const status of STATUSES ) {
      clearJobs( userId )
      config.agent = null

      const id = seed( status, source )

      try {
        await op( id, source )
      } catch( error ) {
        if( !( error instanceof ConflictError ) ) throw error

        continue
      } finally {
        config.agent = null
      }

      const after = findJobById( userId, id )

      if( after === undefined ) {
        matrix[ key( source, status ) ] = 'job deleted'
        continue
      }

      matrix[ key( source, status ) ] = [
        after.status,
        `expires ${ describeExpiry( after.expires_at ) }`,
        `link ${ after.link_state ?? 'null' }`,
      ].join( ' | ' )
    }
  }

  return matrix
}

const both = ( status: JobStatus, outcome: Outcome ): Matrix => {
  return { [ key( 'video', status ) ]: outcome, [ key( 'article', status ) ]: outcome }
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( startTime )
  clearJobs( userId )
  writeNoteMock.mockReset()
  writeNoteMock.mockResolvedValue( 'Notes/A post.md' )
} )

afterEach( () => {
  vi.useRealTimers()
  config.agent = null
} )

// For each function: the (source, status) pairs where it succeeds, and the state the job is
// left in. Every other pair gives a ConflictError.
const EXPECTED: Record< string, Matrix > = {
  'markStatus transcribing': {
    [ key( 'video', 'queued' ) ]: 'transcribing | expires null | link null',
  },
  'markStatus fetching': { [ key( 'article', 'queued' ) ]: 'fetching | expires null | link null' },
  completeAcquisition: {
    [ key( 'video', 'transcribing' ) ]: 'summarizing | expires null | link null',
    [ key( 'article', 'fetching' ) ]: 'summarizing | expires null | link null',
  },
  completeSummary: both( 'summarizing', 'ready_for_review | expires fresh | link off' ),
  'completeSummary with linking': both( 'summarizing', 'linking | expires null | link pending' ),
  completeLinking: both( 'linking', 'ready_for_review | expires fresh | link linked' ),
  failLinking: both( 'linking', 'ready_for_review | expires fresh | link failed' ),
  failSummary: both( 'summarizing', 'summary_failed | expires fresh | link null' ),
  retrySummary: both( 'summary_failed', 'summarizing | expires null | link null' ),
  regenerateSummary: both( 'ready_for_review', 'summarizing | expires null | link null' ),
  'runLinking without an agent': {},
  runLinking: both( 'ready_for_review', 'linking | expires null | link pending' ),
  submitPastedText: { [ key( 'article', 'failed' ) ]: 'summarizing | expires null | link null' },
  failJob: {
    ...both( 'queued', 'failed | expires null | link null' ),
    ...both( 'transcribing', 'failed | expires null | link null' ),
    ...both( 'fetching', 'failed | expires null | link null' ),
    ...both( 'summarizing', 'failed | expires null | link null' ),
    ...both( 'linking', 'failed | expires null | link pending' ),
  },
  updateDraft: both( 'ready_for_review', 'ready_for_review | expires fresh | link off' ),
  saveJob: both( 'ready_for_review', 'saved | expires null | link off' ),
  discardJob: {
    ...both( 'ready_for_review', 'job deleted' ),
    ...both( 'summary_failed', 'job deleted' ),
  },
  findSource: {
    ...both( 'ready_for_review', 'ready_for_review | expires unchanged | link off' ),
    ...both( 'summary_failed', 'summary_failed | expires unchanged | link null' ),
  },
}

describe( 'job lifecycle, as in 0.7.0', () => {
  it.each( Object.keys( OPS ) )( '%s: succeeds only from the listed states', async ( name ) => {
    expect( await run( name ) ).toEqual( EXPECTED[ name ] )
  } )

  it( 'has an expectation for every function', () => {
    expect( Object.keys( EXPECTED ).sort() ).toEqual( Object.keys( OPS ).sort() )
  } )

  it( 'refuses a document of the other kind in completeAcquisition', () => {
    const video = seed( 'transcribing', 'video' )
    const article = seed( 'fetching', 'article' )

    expect( () => completeAcquisition( userId, video, articleDocument ) ).toThrow( ConflictError )
    expect( () => completeAcquisition( userId, article, videoDocument ) ).toThrow( ConflictError )
  } )

  it( 'refuses pasted text on a failed video job', () => {
    const id = seed( 'failed', 'video' )

    expect( () => submitPastedText( userId, id, { text: 'Pasted words. '.repeat( 20 ) } ) )
      .toThrow( 'Pasted text can only continue a failed article job' )
  } )

  it( 'keeps the conflict messages of the hand-written checks', async () => {
    const queued = seed( 'queued', 'video' )
    const summarizing = seed( 'summarizing', 'article' )
    const review = seed( 'ready_for_review', 'article' )
    const summaryFailed = seed( 'summary_failed', 'article' )
    const linking = seed( 'linking', 'article' )

    expect( () => markStatus( userId, queued, 'fetching' ) )
      .toThrow( 'Cannot move job from queued to fetching' )
    expect( () => completeAcquisition( userId, queued, videoDocument ) )
      .toThrow( 'Cannot move job from queued to summarizing' )
    expect( () => completeSummary( userId, queued, 'x', [] ) )
      .toThrow( 'Cannot move job from queued to ready_for_review' )
    expect( () => completeLinking( userId, summarizing ) )
      .toThrow( 'Cannot move job from summarizing to ready_for_review' )
    expect( () => failLinking( userId, summarizing, 'x' ) )
      .toThrow( 'Cannot move job from summarizing to ready_for_review' )
    expect( () => failSummary( userId, queued, 'x' ) )
      .toThrow( 'Cannot move job from queued to summary_failed' )
    expect( () => retrySummary( userId, review ) )
      .toThrow( 'Cannot move job from ready_for_review to summarizing' )
    expect( () => failJob( userId, review, 'x' ) )
      .toThrow( 'Cannot move job from ready_for_review to failed' )
    expect( () => updateDraft( userId, summaryFailed, {} ) )
      .toThrow( 'Cannot move job from summary_failed to ready_for_review' )
    await expect( saveJob( userId, summaryFailed ) )
      .rejects.toThrow( 'Cannot move job from summary_failed to saved' )
    expect( () => discardJob( userId, linking ) ).toThrow( 'Cannot discard a job that is linking' )
    expect( () => findSource( userId, linking ) ).toThrow( 'Transcript not ready' )
  } )

  it( 'lets accepting and rejecting suggestions through the status check only in review', () => {
    const outcomes: Record< string, string > = {}

    for( const status of STATUSES ) {
      clearJobs( userId )

      const id = seed( status, 'article' )

      outcomes[ status ] = [
        notPending( () => acceptSuggestions(
          userId,
          id,
          { ids: [ SAMPLE_UUID ], note_markdown: 'x' },
        ) ),
        notPending( () => rejectSuggestions( userId, id, { ids: [ SAMPLE_UUID ] } ) ),
      ].join( ', ' )
    }

    expect( outcomes ).toEqual( {
      queued: '409, 409',
      fetching: '409, 409',
      transcribing: '409, 409',
      summarizing: '409, 409',
      linking: '409, 409',
      ready_for_review: 'status ok, status ok',
      summary_failed: '409, 409',
      saved: '409, 409',
      failed: '409, 409',
    } )
  } )

  it( 'picks up only queued, summarizing and linking jobs, in creation order', () => {
    const picked: JobStatus[] = []

    for( const status of STATUSES ) {
      clearJobs( userId )
      seed( status, 'article' )

      const job = claimNextJob()

      if( job !== undefined ) picked.push( job.job.status )
    }

    expect( picked ).toEqual( [ 'queued', 'summarizing', 'linking' ] )
  } )

  it( 'lists every job except failed and saved ones', () => {
    for( const status of STATUSES ) {
      seed( status, 'article' )
    }

    expect( listJobs( userId ).map( ( job ) => job.status ).sort() ).toEqual(
      STATUSES.filter( ( status ) => status !== 'failed' && status !== 'saved' ).sort(),
    )
  } )

  it( 'sweeps only expired jobs in the two review states', () => {
    for( const status of STATUSES ) {
      updateJob( userId, seed( status, 'article' ), { expires_at: staleExpiry } )
    }

    expect( deleteExpiredJobs() ).toBe( 2 )
    expect( listJobs( userId ).map( ( job ) => job.status ).sort() ).toEqual( [
      'fetching',
      'linking',
      'queued',
      'summarizing',
      'transcribing',
    ] )
  } )

  it( 'recovers interrupted jobs at startup', () => {
    const ids = Object.fromEntries(
      STATUSES.map( ( status ) => [ status, seed( status, 'article' ) ] ),
    ) as Record< JobStatus, string >

    expect( recoverInterruptedJobs() ).toBe( 3 )

    const after = ( status: JobStatus ) => {
      const job = findJobById( userId, ids[ status ] )!

      return [
        job.status,
        job.error,
        job.link_state,
        job.link_error,
        describeExpiry( job.expires_at ),
      ]
    }

    for( const status of [ 'fetching', 'transcribing' ] as const ) {
      expect( after( status ) ).toEqual( [
        'failed',
        'Interrupted by restart',
        null,
        null,
        'null',
      ] )
    }

    expect( after( 'linking' ) ).toEqual( [
      'ready_for_review',
      null,
      'failed',
      'Interrupted by restart',
      'fresh',
    ] )

    for( const status of [ 'queued', 'summarizing', 'saved', 'failed' ] as const ) {
      expect( findJobById( userId, ids[ status ] )!.status ).toBe( status )
    }

    expect( after( 'ready_for_review' ) ).toEqual( [
      'ready_for_review',
      null,
      'off',
      null,
      'unchanged',
    ] )
    expect( after( 'summary_failed' ) ).toEqual( [
      'summary_failed',
      'earlier failure',
      null,
      null,
      'unchanged',
    ] )
  } )
} )
