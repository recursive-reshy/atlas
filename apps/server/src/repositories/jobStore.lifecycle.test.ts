// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { JobStatus } from '@atlas/shared'
// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import {
  StoredJob,
  clearJobs,
  findJobById,
  insertJob,
  listActiveJobs,
} from './jobStore.repository.js'
import {
  listExpiredJobs,
  claimNextJob,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
} from './system.repository.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

// The status lists come from the lifecycle table (ADR 0048). Here the table is replaced by one
// that names only `saved`, so any list still written out in SQL would give a different answer.

vi.mock( '../jobs/lifecycle.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../jobs/lifecycle.js' ) >()

  return { ...original, statusesWhere: vi.fn( original.statusesWhere ) }
} )

const statusesWhereMock = vi.mocked( statusesWhere )
const original = statusesWhereMock.getMockImplementation()!

const buildJob = ( status: JobStatus, overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status,
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
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
    ...overrides,
  }
}

const onlySaved = (): void => {
  statusesWhereMock.mockImplementation( () => [ 'saved' ] )
}

beforeEach( () => {
  clearJobs( userId )
  statusesWhereMock.mockReset()
  statusesWhereMock.mockImplementation( original )
} )

describe( 'status lists built from the lifecycle table', () => {
  it( 'claimNextJob uses the runnable states', () => {
    const queued = buildJob( 'queued' )
    const saved = buildJob( 'saved' )
    insertJob( userId, queued )
    insertJob( userId, saved )

    expect( claimNextJob( '2026-10-14T10:00:00.000Z' )?.id ).toBe( queued.id )

    onlySaved()

    expect( claimNextJob( '2026-10-14T10:00:00.000Z' )?.id ).toBe( saved.id )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'runnable' )
  } )

  it( 'listActiveJobs uses the active states', () => {
    insertJob( userId, buildJob( 'queued' ) )
    const saved = buildJob( 'saved' )
    insertJob( userId, saved )

    onlySaved()

    expect( listActiveJobs( userId ).map( ( job ) => job.id ) ).toEqual( [ saved.id ] )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'active' )
  } )

  it( 'listExpiredJobs uses the expiring states', () => {
    const past = '2026-10-13T00:00:00.000Z'
    insertJob( userId, buildJob( 'ready_for_review', { expires_at: past } ) )
    const saved = buildJob( 'saved', { expires_at: past } )
    insertJob( userId, saved )

    onlySaved()

    expect( listExpiredJobs( '2026-10-14T10:00:00.000Z' ).map( ( job ) => job.id ) )
      .toEqual( [ saved.id ] )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'expires' )
  } )

  it( 'markInterruptedJobs uses the states that fail on restart', () => {
    const transcribing = buildJob( 'transcribing' )
    const saved = buildJob( 'saved' )
    insertJob( userId, transcribing )
    insertJob( userId, saved )

    onlySaved()

    expect( markInterruptedJobs( 'Interrupted', '2026-10-14T11:00:00.000Z' ) ).toBe( 1 )
    expect( findJobById( userId, saved.id )?.status ).toBe( 'failed' )
    expect( findJobById( userId, transcribing.id )?.status ).toBe( 'transcribing' )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'onRestart', 'failed' )
  } )

  it( 'markInterruptedLinkingJobs uses the states that go to review on restart', () => {
    const linking = buildJob( 'linking', { link_state: 'pending' } )
    const saved = buildJob( 'saved' )
    insertJob( userId, linking )
    insertJob( userId, saved )

    onlySaved()

    expect( markInterruptedLinkingJobs(
      'Interrupted',
      '2026-10-14T11:00:00.000Z',
      '2026-10-15T11:00:00.000Z',
    ) ).toBe( 1 )
    expect( findJobById( userId, saved.id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
    } )
    expect( findJobById( userId, linking.id )?.status ).toBe( 'linking' )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'onRestart', 'ready_for_review' )
  } )
} )
