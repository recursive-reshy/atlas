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
import { JobStatus, SourceType } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError } from '../errors.js'
// Repositories
import { clearJobs, insertJob } from '../repositories/jobStore.repository.js'
// Services
import {
  completeAcquisition,
  completeSummary,
  failJob,
  failSummary,
  markStatus,
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
import { saveJob, submitPastedText, updateDraft } from '../services/jobDraft.service.js'
// Clients
import { writeNote } from '../clients/vault.client.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
// Lifecycle
import { assertMove } from './lifecycle.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

// The services hold no status checks of their own: a move the lifecycle table refuses is
// refused, even from the state each function normally accepts (ADR 0048).

vi.mock( '../clients/vault.client.js' )
vi.mock( './lifecycle.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( './lifecycle.js' ) >()

  return { ...original, assertMove: vi.fn( original.assertMove ) }
} )

const assertMoveMock = vi.mocked( assertMove )
const writeNoteMock = vi.mocked( writeNote )

const REFUSED = 'The lifecycle table refuses this move'
const SAMPLE_UUID = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const document = { kind: 'video' as const, ...transcriptFixture }

const seed = ( status: JobStatus, source: SourceType = 'video' ): string => {
  const id = crypto.randomUUID()
  const hasDraft = status === 'linking' || status === 'ready_for_review'

  insertJob( userId, {
    id,
    url: 'https://www.youtube.com/watch?v=abc',
    status,
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
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
    expires_at: null,
    saved_path: null,
    summary_model: null,
    prompt_profile_id: null,
    link_state: null,
    link_error: null,
    source_document: document,
    source_type: source,
    feed_id: null,
    feed_name: null,
    gmail_source_id: null,
    gmail_source_name: null,
  } )

  return id
}

const CASES: Array< [ string, JobStatus, ( id: string ) => unknown, SourceType? ] > = [
  [ 'markStatus', 'queued', ( id ) => markStatus( userId, id, 'transcribing' ) ],
  [ 'completeAcquisition', 'transcribing', ( id ) => completeAcquisition( userId, id, document ) ],
  [ 'completeSummary', 'summarizing', ( id ) => completeSummary( userId, id, '## Summary', [] ) ],
  [ 'completeLinking', 'linking', ( id ) => completeLinking( userId, id ) ],
  [ 'failLinking', 'linking', ( id ) => failLinking( userId, id, 'x' ) ],
  [ 'failSummary', 'summarizing', ( id ) => failSummary( userId, id, 'x' ) ],
  [ 'retrySummary', 'summary_failed', ( id ) => retrySummary( userId, id ) ],
  [ 'regenerateSummary', 'ready_for_review', ( id ) => regenerateSummary( userId, id, {} ) ],
  [ 'runLinking', 'ready_for_review', ( id ) => runLinking( userId, id, {} ) ],
  [
    'submitPastedText',
    'failed',
    ( id ) => submitPastedText( userId, id, { text: 'Pasted words. '.repeat( 20 ) } ),
    'article',
  ],
  [ 'failJob', 'queued', ( id ) => failJob( userId, id, 'x' ) ],
  [ 'updateDraft', 'ready_for_review', ( id ) => updateDraft(
    userId,
    id,
    { target_folder: 'Notes' },
  ) ],
  [
    'acceptSuggestions',
    'ready_for_review',
    ( id ) => acceptSuggestions( userId, id, { ids: [ SAMPLE_UUID ], note_markdown: 'x' } ),
  ],
  [
    'rejectSuggestions',
    'ready_for_review',
    ( id ) => rejectSuggestions( userId, id, { ids: [ SAMPLE_UUID ] } ),
  ],
  [ 'saveJob', 'ready_for_review', ( id ) => saveJob( userId, id ) ],
]

beforeEach( () => {
  clearJobs( userId )
  config.agent = { url: 'http://localhost:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }
  writeNoteMock.mockResolvedValue( 'Notes/A talk.md' )
  assertMoveMock.mockImplementation( () => {
    throw new ConflictError( REFUSED )
  } )
} )

afterEach( () => {
  config.agent = null
} )

describe( 'the services enforce the lifecycle table', () => {
  it.each( CASES )( '%s asks the table', async ( _name, status, call, source ) => {
    const id = seed( status, source )

    await expect( Promise.resolve().then( () => call( id ) ) )
      .rejects.toThrow( REFUSED )
  } )
} )
