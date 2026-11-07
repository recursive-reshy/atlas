// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Repositories
import {
  findJobById,
  insertJob,
  updateJob,
} from './jobStore.repository.js'
import type { StoredJob } from './jobStore.repository.js'
import { insertFeed } from './feeds.repository.js'
import type { StoredFeed } from './feeds.repository.js'
import { saveAccount, setAccountStatus } from './gmailAccount.repository.js'
import { insertSource } from './gmailSources.repository.js'
import type { StoredGmailSource } from './gmailSources.repository.js'
import { findNote } from './meleteNotes.repository.js'
import { findSubject, updateSubject } from './meleteSubjects.repository.js'
import { setModules } from './userModules.repository.js'
import { findUserById, updateUser } from './users.repository.js'
import { getDatabase } from './database.js'
import {
  claimNextDraft,
  claimNextMapping,
  claimNextGeneration,
  claimNextJob,
  deleteHealthExcept,
  listDueFeeds,
  listDueGmailSources,
  listExpiredJobs,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
  requeueGenerating,
  requeueMapping,
} from './system.repository.js'
// Test support
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'
import { seedCheck } from '../test-support/health.fixture.js'

const buildJob = ( overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status: 'queued',
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

const at = ( minutes: number ): string => {
  return new Date( Date.parse( '2026-10-14T12:00:00.000Z' ) + minutes * 60_000 ).toISOString()
}

type StampColumn = 'last_job_started_at' | 'last_generation_started_at'

const stampOf = ( userId: string, column: StampColumn ): string | null => {
  const row = getDatabase()
    .prepare( `SELECT ${ column } AS stamp FROM users WHERE id = ?` )
    .get( userId )

  return ( row as { stamp: string | null } ).stamp
}

const setColumn = ( userId: string, column: string, value: string ): void => {
  getDatabase().prepare( `UPDATE users SET ${ column } = ? WHERE id = ?` ).run( value, userId )
}

describe( 'claimNextJob', () => {
  it( 'returns the earliest-inserted queued job with its owner, skipping other statuses', () => {
    const { id: userId } = createTestUser()
    const transcribing = buildJob( { status: 'transcribing' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( userId, transcribing )
    insertJob( userId, firstQueued )
    insertJob( userId, secondQueued )

    expect( claimNextJob( at( 0 ) ) ).toEqual( { ...firstQueued, user_id: userId } )
  } )

  it( 'also returns summarizing jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const summarizing = buildJob( { status: 'summarizing' } )
    const queued = buildJob()
    insertJob( userId, buildJob( { status: 'ready_for_review' } ) )
    insertJob( userId, summarizing )
    insertJob( userId, queued )

    expect( claimNextJob( at( 0 ) ) ).toEqual( { ...summarizing, user_id: userId } )

    updateJob( userId, summarizing.id, { status: 'summary_failed' } )

    expect( claimNextJob( at( 1 ) ) ).toEqual( { ...queued, user_id: userId } )
  } )

  it( 'also returns linking jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, buildJob( { status: 'ready_for_review', link_state: 'linked' } ) )
    insertJob( userId, linking )
    insertJob( userId, buildJob() )

    expect( claimNextJob( at( 0 ) ) ).toEqual( { ...linking, user_id: userId } )
  } )

  it( 'returns undefined when no job is runnable', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( { status: 'failed' } ) )
    insertJob( userId, buildJob( { status: 'summary_failed' } ) )
    insertJob( userId, buildJob( { status: 'saved' } ) )

    expect( claimNextJob( at( 0 ) ) ).toBeUndefined()
  } )

  it( 'leaves the job as it was and stamps its owner with the time', () => {
    const { id: userId } = createTestUser()
    const queued = buildJob()
    insertJob( userId, queued )

    expect( stampOf( userId, 'last_job_started_at' ) ).toBeNull()

    claimNextJob( at( 5 ) )

    expect( stampOf( userId, 'last_job_started_at' ) ).toBe( at( 5 ) )
    expect( findJobById( userId, queued.id )?.status ).toBe( 'queued' )
  } )

  it( 'takes turns between users, so a long queue does not starve the other user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const firstJobs = [ buildJob(), buildJob(), buildJob() ]
    const secondJob = buildJob()
    firstJobs.forEach( ( job ) => insertJob( first, job ) )
    insertJob( second, secondJob )

    const claimed = [ 0, 1, 2, 3 ].map( ( minute ) => {
      const next = claimNextJob( at( minute ) )

      if( next !== undefined ) {
        updateJob( next.user_id, next.id, { status: 'failed' } )
      }

      return next?.id
    } )

    expect( claimed ).toEqual(
      [ firstJobs[ 0 ]?.id, secondJob.id, firstJobs[ 1 ]?.id, firstJobs[ 2 ]?.id ],
    )
  } )

  it( 'serves the user who started a job longest ago, never-started users first', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const third = createTestUser().id
    const theirs = buildJob()
    insertJob( first, buildJob() )
    insertJob( second, buildJob() )
    insertJob( third, theirs )
    setColumn( first, 'last_job_started_at', at( -10 ) )
    setColumn( second, 'last_job_started_at', at( -5 ) )

    expect( claimNextJob( at( 0 ) )?.user_id ).toBe( third )
    expect( claimNextJob( at( 1 ) )?.user_id ).toBe( first )
    expect( claimNextJob( at( 2 ) )?.user_id ).toBe( second )
  } )

  it( 'breaks a tie between users who never started by who joined first', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    insertJob( second, buildJob() )
    insertJob( first, buildJob() )
    setColumn( second, 'created_at', at( -20 ) )
    setColumn( first, 'created_at', at( -10 ) )

    expect( claimNextJob( at( 0 ) )?.user_id ).toBe( second )
  } )

  describe( 'who is eligible', () => {
    it( 'never claims for a member without the Transcriber module, then resumes', () => {
      const member = createTestUser().id
      const job = buildJob()
      insertJob( member, job )
      setModules( member, [ 'melete' ] )

      expect( claimNextJob( at( 0 ) ) ).toBeUndefined()
      expect( stampOf( member, 'last_job_started_at' ) ).toBeNull()

      setModules( member, [ 'transcriber', 'melete' ] )

      expect( claimNextJob( at( 1 ) ) ).toEqual( { ...job, user_id: member } )
    } )

    it( 'never claims for a removed user, and resumes when they are restored', () => {
      const member = createTestUser().id
      const job = buildJob()
      insertJob( member, job )
      updateUser( member, { status: 'removed' } )

      expect( claimNextJob( at( 0 ) ) ).toBeUndefined()

      updateUser( member, { status: 'active' } )

      expect( claimNextJob( at( 1 ) ) ).toEqual( { ...job, user_id: member } )
    } )

    it( 'always serves the admin, who has no module rows', () => {
      const admin = createTestUser( { role: 'admin' } ).id
      const job = buildJob()
      insertJob( admin, job )

      expect( claimNextJob( at( 0 ) ) ).toEqual( { ...job, user_id: admin } )
    } )

    it( 'skips an ineligible user and serves the next one', () => {
      const off = createTestUser( { modules: [ 'melete' ] } ).id
      const on = createTestUser().id
      const job = buildJob()
      insertJob( off, buildJob() )
      insertJob( on, job )

      expect( claimNextJob( at( 0 ) ) ).toEqual( { ...job, user_id: on } )
    } )

    it( 'does not need a vault', () => {
      const member = createTestUser( { vault_dir: null } ).id
      const job = buildJob()
      insertJob( member, job )

      expect( findUserById( member )?.vault_dir ).toBeNull()
      expect( claimNextJob( at( 0 ) ) ).toEqual( { ...job, user_id: member } )
    } )
  } )
} )

describe( 'markInterruptedJobs', () => {
  const statuses = [
    'queued',
    'fetching',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] as const
  const interrupted = [ 'fetching', 'transcribing' ]

  it( 'fails only the fetch and transcribe jobs', () => {
    const { id: userId } = createTestUser()
    const ids = new Map( statuses.map( ( status ) => {
      const job = buildJob( { status } )
      insertJob( userId, job )

      return [ status, job.id ] as const
    } ) )

    const count = markInterruptedJobs( 'Interrupted by restart', '2026-10-15T09:00:00.000Z' )

    expect( count ).toBe( 2 )

    for( const status of statuses ) {
      const job = findJobById( userId, ids.get( status ) ?? '' )

      if( interrupted.includes( status ) ) {
        expect( job ).toMatchObject( {
          status: 'failed',
          error: 'Interrupted by restart',
          updated_at: '2026-10-15T09:00:00.000Z',
        } )
      } else {
        expect( job ).toMatchObject( { status, error: null } )
        expect( job?.updated_at ).toBe( '2026-10-14T10:00:00.000Z' )
      }
    }
  } )

  it( 'fails the interrupted jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'fetching' } )
    const two = buildJob( { status: 'transcribing' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 2 )
    expect( findJobById( first, one.id )?.status ).toBe( 'failed' )
    expect( findJobById( second, two.id )?.status ).toBe( 'failed' )
  } )

  it( 'returns 0 when nothing was interrupted', () => {
    insertJob( createTestUser().id, buildJob() )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
  } )

  it( 'leaves a linking job alone', () => {
    const { id: userId } = createTestUser()
    const job = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, job )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
    expect( findJobById( userId, job.id )?.status ).toBe( 'linking' )
  } )
} )

describe( 'markInterruptedLinkingJobs', () => {
  it( 'moves linking jobs to review as failed, and only those', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    const summarizing = buildJob( { status: 'summarizing' } )
    insertJob( userId, linking )
    insertJob( userId, summarizing )

    const count = markInterruptedLinkingJobs(
      'Interrupted by restart',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    )

    expect( count ).toBe( 1 )
    expect( findJobById( userId, linking.id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Interrupted by restart',
      expires_at: '2026-10-16T09:00:00.000Z',
      updated_at: '2026-10-15T09:00:00.000Z',
    } )
    expect( findJobById( userId, summarizing.id )?.status ).toBe( 'summarizing' )
  } )

  it( 'covers the linking jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'linking', link_state: 'pending' } )
    const two = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedLinkingJobs(
      'x',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    ) )
      .toBe( 2 )
  } )
} )

describe( 'listExpiredJobs', () => {
  const now = '2026-10-15T12:00:00.000Z'

  it( 'returns review and failed-summary jobs whose expiry has passed', () => {
    const { id: userId } = createTestUser()
    const review = buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T11:59:59.000Z',
    } )
    const failed = buildJob( { status: 'summary_failed', expires_at: now } )
    insertJob( userId, review )
    insertJob( userId, failed )

    expect( listExpiredJobs( now ).map( ( { id } ) => id ).toSorted() ).toEqual(
      [ review.id, failed.id ].toSorted(),
    )
  } )

  it( 'ignores unexpired jobs, null expiry and other statuses', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T12:00:01.000Z',
    } ) )
    insertJob( userId, buildJob( { status: 'ready_for_review', expires_at: null } ) )
    insertJob( userId, buildJob( { status: 'saved', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( { status: 'failed', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( {
      status: 'summarizing',
      expires_at: '2026-10-01T00:00:00.000Z',
    } ) )

    expect( listExpiredJobs( now ) ).toEqual( [] )
  } )

  it( 'returns the expired jobs of every user, each with its owner', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    const two = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( listExpiredJobs( now ).map( ( { id, user_id } ) => [ id, user_id ] ).toSorted() )
      .toEqual( [ [ one.id, first ], [ two.id, second ] ].toSorted() )
  } )
} )

describe( 'listExpiredJobs for users who are not eligible', () => {
  it( 'still lists the expired jobs of a removed user and of a user without the module', () => {
    const removed = createTestUser().id
    const moduleOff = createTestUser( { modules: [ 'melete' ] } ).id
    const expired = { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } as const
    const one = buildJob( expired )
    const two = buildJob( expired )
    insertJob( removed, one )
    insertJob( moduleOff, two )
    updateUser( removed, { status: 'removed' } )

    expect( listExpiredJobs( '2026-10-15T12:00:00.000Z' ).map( ( { id } ) => id ).toSorted() )
      .toEqual( [ one.id, two.id ].toSorted() )
  } )
} )

const buildFeed = ( overrides: Partial< StoredFeed > = {} ): StoredFeed => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    url: 'https://example.com',
    feed_url: `https://example.com/${ id }.xml`,
    name: 'A blog',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-18T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const addFeed = ( userId: string, feed: StoredFeed ): StoredFeed => {
  insertFeed( userId, feed )
  seedCheck( userId, 'feed', feed.id, feed.last_checked_at, feed.last_error )

  return feed
}

describe( 'listDueFeeds', () => {
  const now = '2026-10-18T12:00:00.000Z'

  it( 'returns enabled feeds never checked or last checked before now minus the interval', () => {
    const { id: userId } = createTestUser()

    for( const feed of [
      buildFeed( { name: 'never' } ),
      buildFeed( { name: 'old', last_checked_at: '2026-10-18T10:59:59.000Z' } ),
      buildFeed( { name: 'edge', last_checked_at: '2026-10-18T11:00:00.000Z' } ),
      buildFeed( { name: 'recent', last_checked_at: '2026-10-18T11:30:00.000Z' } ),
    ] ) {
      addFeed( userId, feed )
    }

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ).sort() )
      .toEqual( [ 'edge', 'never', 'old' ] )
  } )

  it( 'leaves out disabled and deleted feeds', () => {
    const { id: userId } = createTestUser()

    addFeed( userId, buildFeed( { enabled: false } ) )
    addFeed( userId, buildFeed( { deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toEqual( [] )
  } )

  it( 'honours the interval it is given', () => {
    const { id: userId } = createTestUser()

    addFeed( userId, buildFeed( { last_checked_at: '2026-10-18T11:30:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toHaveLength( 0 )
    expect( listDueFeeds( now, 15 ) ).toHaveLength( 1 )
  } )

  it( 'leaves out the feeds of a removed user and of a user without the Transcriber module', () => {
    const removed = createTestUser().id
    const moduleOff = createTestUser().id
    const active = createTestUser().id

    addFeed( removed, buildFeed( { name: 'removed' } ) )
    addFeed( moduleOff, buildFeed( { name: 'module off' } ) )
    addFeed( active, buildFeed( { name: 'active' } ) )
    updateUser( removed, { status: 'removed' } )
    setModules( moduleOff, [ 'melete' ] )

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ) ).toEqual( [ 'active' ] )

    updateUser( removed, { status: 'active' } )
    setModules( moduleOff, [ 'transcriber' ] )

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ).toSorted() )
      .toEqual( [ 'active', 'module off', 'removed' ] )
  } )

  it( 'still serves the admin, who has no module rows', () => {
    const admin = createTestUser( { role: 'admin' } ).id

    addFeed( admin, buildFeed( { name: 'admin feed' } ) )

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ) ).toEqual( [ 'admin feed' ] )
  } )

  it( 'returns the least recently checked first, across users, each with its owner', () => {
    const first = createTestUser().id
    const second = createTestUser().id

    addFeed( first, buildFeed( { name: 'b', last_checked_at: '2026-10-18T09:00:00.000Z' } ) )
    addFeed( second, buildFeed( { name: 'a', last_checked_at: '2026-10-18T08:00:00.000Z' } ) )
    addFeed( first, buildFeed( { name: 'never' } ) )

    expect( listDueFeeds( now, 60 ).map( ( { name, user_id } ) => [ name, user_id ] ) )
      .toEqual( [ [ 'never', first ], [ 'a', second ], [ 'b', first ] ] )
  } )
} )

const buildSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
  return {
    id: crypto.randomUUID(),
    name: 'Upwork alerts',
    match: { kind: 'labels', label_ids: [ 'Label_1' ] },
    destination: 'jobs',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: '2026-10-19T10:00:00.000Z',
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-19T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const connect = ( userId: string ): void => {
  saveAccount( userId, {
    email: `${ userId }@example.com`,
    refresh_token_enc: 'v1:x',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const addSource = ( userId: string, source: StoredGmailSource ): StoredGmailSource => {
  insertSource( userId, source )
  seedCheck( userId, 'gmail_source', source.id, source.last_checked_at, source.last_error )

  return source
}

describe( 'listDueGmailSources', () => {
  const now = '2026-10-19T12:00:00.000Z'

  it( 'returns sources never checked or last checked at least one interval ago', () => {
    const { id: userId } = createTestUser()

    connect( userId )

    for( const source of [
      buildSource( { name: 'recent', last_checked_at: '2026-10-19T11:30:00.000Z' } ),
      buildSource( { name: 'old', last_checked_at: '2026-10-19T09:00:00.000Z' } ),
      buildSource( { name: 'exact', last_checked_at: '2026-10-19T11:00:00.000Z' } ),
      buildSource( { name: 'never' } ),
      buildSource( { name: 'disabled', enabled: false } ),
      buildSource( { name: 'deleted', deleted_at: '2026-10-19T08:00:00.000Z' } ),
    ] ) {
      addSource( userId, source )
    }

    expect( listDueGmailSources( now, 60 ).map( ( { name } ) => name ) )
      .toEqual( [ 'never', 'old', 'exact' ] )
  } )

  it( 'honours the interval', () => {
    const { id: userId } = createTestUser()

    connect( userId )
    addSource( userId, buildSource( { last_checked_at: '2026-10-19T11:30:00.000Z' } ) )

    expect( listDueGmailSources( now, 60 ) ).toHaveLength( 0 )
    expect( listDueGmailSources( now, 30 ) ).toHaveLength( 1 )
  } )

  it( 'leaves out the sources of removed and module-off users', () => {
    const removed = createTestUser().id
    const moduleOff = createTestUser().id
    const active = createTestUser().id

    for( const userId of [ removed, moduleOff, active ] ) {
      connect( userId )
    }

    addSource( removed, buildSource( { name: 'removed' } ) )
    addSource( moduleOff, buildSource( { name: 'module off' } ) )
    addSource( active, buildSource( { name: 'active' } ) )
    updateUser( removed, { status: 'removed' } )
    setModules( moduleOff, [ 'melete' ] )

    expect( listDueGmailSources( now, 60 ).map( ( { name } ) => name ) ).toEqual( [ 'active' ] )
  } )

  it( 'only returns sources whose owner has a connected Gmail account', () => {
    const connected = createTestUser().id
    const broken = createTestUser().id
    const never = createTestUser().id

    connect( connected )
    connect( broken )
    setAccountStatus( broken, 'reconnect_needed', 'Revoked' )

    addSource( connected, buildSource( { name: 'ok' } ) )
    addSource( broken, buildSource( { name: 'broken' } ) )
    addSource( never, buildSource( { name: 'never connected' } ) )

    expect( listDueGmailSources( now, 60 ).map( ( { name, user_id } ) => [ name, user_id ] ) )
      .toEqual( [ [ 'ok', connected ] ] )
  } )
} )

const melete = ( vaultDir: string | null = `vault-${ crypto.randomUUID().slice( 0, 8 ) }` ) => {
  return createTestUser( { vault_dir: vaultDir } ).id
}

describe( 'claimNextGeneration', () => {
  it( 'returns undefined when nothing is queued', () => {
    const userId = melete()

    addNote( userId, addSubject( userId ), { generation: 'idle' } )

    expect( claimNextGeneration( at( 0 ) ) ).toBeUndefined()
  } )

  it( 'claims the oldest enrolled note, marks it generating and says whose it is', () => {
    const userId = melete()
    const subjectId = addSubject( userId )
    const queued = { generation: 'queued' }
    const later = addNote(
      userId,
      subjectId,
      { ...queued, enrolledAt: '2026-10-02T00:00:00.000Z' },
    )
    const earlier = addNote(
      userId,
      subjectId,
      { ...queued, enrolledAt: '2026-10-01T00:00:00.000Z' },
    )

    expect( claimNextGeneration( at( 0 ) ) )
      .toMatchObject( { id: earlier, generation: 'generating', user_id: userId } )
    expect( findNote( userId, earlier )?.generation ).toBe( 'generating' )
    expect( claimNextGeneration( at( 1 ) ) ).toMatchObject( { id: later } )
    expect( claimNextGeneration( at( 2 ) ) ).toBeUndefined()
  } )

  it( 'never returns the same note twice', () => {
    const userId = melete()
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { generation: 'queued' } )
    addNote( userId, subjectId, { generation: 'queued' } )

    expect( claimNextGeneration( at( 0 ) )?.id ).not.toBe( claimNextGeneration( at( 1 ) )?.id )
  } )

  it( 'skips notes that are generating or failed', () => {
    const userId = melete()
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { generation: 'generating' } )
    addNote( userId, subjectId, { generation: 'failed' } )

    expect( claimNextGeneration( at( 0 ) ) ).toBeUndefined()
  } )

  it( 'stamps the owner with the time', () => {
    const userId = melete()

    addNote( userId, addSubject( userId ), { generation: 'queued' } )
    claimNextGeneration( at( 7 ) )

    expect( stampOf( userId, 'last_generation_started_at' ) ).toBe( at( 7 ) )
    expect( stampOf( userId, 'last_job_started_at' ) ).toBeNull()
  } )

  it( 'takes turns between users, whoever enrolled first', () => {
    const first = melete()
    const second = melete()
    const firstSubject = addSubject( first )
    const queued = { generation: 'queued' }

    const firstNotes = [ '2026-10-01', '2026-10-02', '2026-10-03' ].map( ( day ) => {
      return addNote( first, firstSubject, { ...queued, enrolledAt: `${ day }T00:00:00.000Z` } )
    } )
    const theirs = addNote(
      second,
      addSubject( second ),
      { ...queued, enrolledAt: '2026-10-09T00:00:00.000Z' },
    )

    expect( [ 0, 1, 2, 3 ].map( ( minute ) => claimNextGeneration( at( minute ) )?.id ) )
      .toEqual( [ firstNotes[ 0 ], theirs, firstNotes[ 1 ], firstNotes[ 2 ] ] )
  } )

  describe( 'who is eligible', () => {
    it( 'never claims for a user with no vault, and resumes once they choose one', () => {
      const userId = melete( null )
      const note = addNote( userId, addSubject( userId ), { generation: 'queued' } )

      expect( claimNextGeneration( at( 0 ) ) ).toBeUndefined()

      getDatabase().prepare( 'UPDATE users SET vault_dir = \'chosen\' WHERE id = ?' ).run( userId )

      expect( claimNextGeneration( at( 1 ) )?.id ).toBe( note )
    } )

    it( 'never claims for a member without the Melete module', () => {
      const userId = melete()
      addNote( userId, addSubject( userId ), { generation: 'queued' } )
      setModules( userId, [ 'transcriber' ] )

      expect( claimNextGeneration( at( 0 ) ) ).toBeUndefined()

      setModules( userId, [ 'melete' ] )

      expect( claimNextGeneration( at( 1 ) ) ).toBeDefined()
    } )

    it( 'never claims for a removed user, and resumes when they are restored', () => {
      const userId = melete()
      addNote( userId, addSubject( userId ), { generation: 'queued' } )
      updateUser( userId, { status: 'removed' } )

      expect( claimNextGeneration( at( 0 ) ) ).toBeUndefined()

      updateUser( userId, { status: 'active' } )

      expect( claimNextGeneration( at( 1 ) ) ).toBeDefined()
    } )

    it( 'serves the admin once they have a vault', () => {
      const admin = createTestUser( { role: 'admin', vault_dir: 'boss' } ).id

      addNote( admin, addSubject( admin ), { generation: 'queued' } )

      expect( claimNextGeneration( at( 0 ) )?.user_id ).toBe( admin )
    } )

    it( 'skips an ineligible user and serves the next one', () => {
      const off = melete( null )
      const on = melete()
      addNote( off, addSubject( off ), { generation: 'queued' } )
      const note = addNote( on, addSubject( on ), { generation: 'queued' } )

      expect( claimNextGeneration( at( 0 ) )?.id ).toBe( note )
    } )
  } )
} )

const drafting = ( userId: string, folder = 'Learning/Data' ): string => {
  const id = addSubject( userId, folder )

  updateSubject( userId, id, { target_level: 'working', syllabus_status: 'drafting' } )

  return id
}

describe( 'claimNextDraft', () => {
  it( 'returns undefined when no subject is drafting', () => {
    const userId = melete()
    const id = addSubject( userId )

    updateSubject( userId, id, { syllabus_status: 'draft' } )
    addSubject( userId, 'Learning/Other' )

    expect( claimNextDraft( at( 0 ), [] ) ).toBeUndefined()
  } )

  it( 'claims a drafting subject and says whose it is, leaving it drafting', () => {
    const userId = melete()
    const id = drafting( userId )

    expect( claimNextDraft( at( 0 ), [] ) ).toEqual( { id, user_id: userId } )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'drafting' )
  } )

  it( 'skips the subjects it is told it has already tried', () => {
    const userId = melete()
    const first = drafting( userId, 'Learning/A' )
    const second = drafting( userId, 'Learning/B' )
    const claimed = claimNextDraft( at( 0 ), [] )?.id

    expect( [ first, second ] ).toContain( claimed )
    expect( claimNextDraft( at( 1 ), [ claimed ?? '' ] )?.id )
      .toBe( claimed === first ? second : first )
    expect( claimNextDraft( at( 2 ), [ first, second ] ) ).toBeUndefined()
  } )

  it( 'stamps the owner with the time, as a claimed note does', () => {
    const userId = melete()

    drafting( userId )
    claimNextDraft( at( 7 ), [] )

    expect( stampOf( userId, 'last_generation_started_at' ) ).toBe( at( 7 ) )
    expect( stampOf( userId, 'last_job_started_at' ) ).toBeNull()
  } )

  it( 'takes turns between users', () => {
    const first = melete()
    const second = melete()
    const firstOne = drafting( first, 'Learning/A' )
    const firstTwo = drafting( first, 'Learning/B' )
    const theirs = drafting( second )
    const tried: string[] = []
    const order = [ 0, 1, 2 ].map( ( minute ) => {
      const id = claimNextDraft( at( minute ), tried )?.id ?? ''

      tried.push( id )

      return id
    } )

    expect( order[ 1 ] ).toBe( theirs )
    expect( new Set( [ order[ 0 ], order[ 2 ] ] ) ).toEqual( new Set( [ firstOne, firstTwo ] ) )
  } )

  describe( 'who is eligible', () => {
    it( 'never claims for a user with no vault, and resumes once they choose one', () => {
      const userId = melete( null )
      const id = drafting( userId )

      expect( claimNextDraft( at( 0 ), [] ) ).toBeUndefined()

      getDatabase().prepare( 'UPDATE users SET vault_dir = \'chosen\' WHERE id = ?' ).run( userId )

      expect( claimNextDraft( at( 1 ), [] )?.id ).toBe( id )
    } )

    it( 'never claims for a member without the Melete module', () => {
      const userId = melete()

      drafting( userId )
      setModules( userId, [ 'transcriber' ] )

      expect( claimNextDraft( at( 0 ), [] ) ).toBeUndefined()

      setModules( userId, [ 'melete' ] )

      expect( claimNextDraft( at( 1 ), [] ) ).toBeDefined()
    } )

    it( 'never claims for a removed user', () => {
      const userId = melete()

      drafting( userId )
      updateUser( userId, { status: 'removed' } )

      expect( claimNextDraft( at( 0 ), [] ) ).toBeUndefined()
    } )
  } )
} )

describe( 'claimNextMapping', () => {
  const queued = { mapping: 'queued' }

  it( 'returns undefined when nothing is queued for mapping', () => {
    const userId = melete()

    addNote( userId, addSubject( userId ), { mapping: 'idle' } )
    addNote( userId, addSubject( userId, 'Learning/B' ), { mapping: 'failed' } )

    expect( claimNextMapping( at( 0 ) ) ).toBeUndefined()
  } )

  it( 'claims the oldest enrolled note, marks it mapping and says whose it is', () => {
    const userId = melete()
    const subjectId = addSubject( userId )
    const enrolled = ( enrolledAt: string ): string => {
      return addNote( userId, subjectId, { ...queued, enrolledAt } )
    }
    const later = enrolled( '2026-10-02T00:00:00.000Z' )
    const earlier = enrolled( '2026-10-01T00:00:00.000Z' )

    expect( claimNextMapping( at( 0 ) ) )
      .toMatchObject( { id: earlier, mapping: 'mapping', user_id: userId } )
    expect( findNote( userId, earlier )?.mapping ).toBe( 'mapping' )
    expect( claimNextMapping( at( 1 ) ) ).toMatchObject( { id: later } )
    expect( claimNextMapping( at( 2 ) ) ).toBeUndefined()
  } )

  it( 'waits for a note that is still queued for or making its questions', () => {
    const userId = melete()
    const subjectId = addSubject( userId )

    addNote( userId, subjectId, { ...queued, generation: 'queued' } )
    addNote( userId, subjectId, { ...queued, generation: 'generating' } )

    expect( claimNextMapping( at( 0 ) ) ).toBeUndefined()
  } )

  it( 'takes the same turns between users as generation, and stamps the owner', () => {
    const first = melete()
    const second = melete()
    const firstSubject = addSubject( first )
    const firstNotes = [ '2026-10-01', '2026-10-02' ].map( ( day ) => {
      return addNote( first, firstSubject, { ...queued, enrolledAt: `${ day }T00:00:00.000Z` } )
    } )
    const theirs = addNote(
      second,
      addSubject( second ),
      { ...queued, enrolledAt: '2026-10-09T00:00:00.000Z' },
    )

    expect( [ 0, 1, 2 ].map( ( minute ) => claimNextMapping( at( minute ) )?.id ) )
      .toEqual( [ firstNotes[ 0 ], theirs, firstNotes[ 1 ] ] )
    expect( stampOf( first, 'last_generation_started_at' ) ).toBe( at( 2 ) )
  } )

  it( 'never claims for a user with no vault, and resumes once they choose one', () => {
    const userId = melete( null )
    const note = addNote( userId, addSubject( userId ), queued )

    expect( claimNextMapping( at( 0 ) ) ).toBeUndefined()

    getDatabase().prepare( 'UPDATE users SET vault_dir = \'chosen\' WHERE id = ?' ).run( userId )

    expect( claimNextMapping( at( 1 ) )?.id ).toBe( note )
  } )
} )

describe( 'requeueMapping', () => {
  it( 'moves mapping notes of every user back to queued and reports how many', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const stuck = addNote( first, addSubject( first ), { mapping: 'mapping' } )
    const alsoStuck = addNote( second, addSubject( second ), { mapping: 'mapping' } )
    const failed = addNote( first, addSubject( first, 'Learning/Other' ), { mapping: 'failed' } )

    expect( requeueMapping() ).toBe( 2 )
    expect( findNote( first, stuck )?.mapping ).toBe( 'queued' )
    expect( findNote( second, alsoStuck )?.mapping ).toBe( 'queued' )
    expect( findNote( first, failed )?.mapping ).toBe( 'failed' )
    expect( requeueMapping() ).toBe( 0 )
  } )
} )

describe( 'requeueGenerating', () => {
  it( 'moves generating notes of every user back to queued and reports how many', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const stuck = addNote( first, addSubject( first ), { generation: 'generating' } )
    const alsoStuck = addNote( second, addSubject( second ), { generation: 'generating' } )
    const failed = addNote( first, addSubject( first, 'Learning/Other' ), { generation: 'failed' } )

    expect( requeueGenerating() ).toBe( 2 )
    expect( findNote( first, stuck )?.generation ).toBe( 'queued' )
    expect( findNote( second, alsoStuck )?.generation ).toBe( 'queued' )
    expect( findNote( first, failed )?.generation ).toBe( 'failed' )
    expect( requeueGenerating() ).toBe( 0 )
  } )
} )

describe( 'deleteHealthExcept', () => {
  const insert = ( userId: string | null, kind: string, id: string ): void => {
    getDatabase().prepare( `INSERT INTO health_status ( user_id, kind, subject_id )
      VALUES ( ?, ?, ? )` ).run( userId, kind, id )
    getDatabase().prepare( `INSERT INTO health_errors ( user_id, kind, subject_id, at, message )
      VALUES ( ?, ?, ?, 'now', 'x' )` ).run( userId, kind, id )
  }
  const kinds = ( table: string ): string[] => {
    return getDatabase().prepare( `SELECT kind FROM ${ table } ORDER BY kind` )
      .pluck().all() as string[]
  }

  it( 'deletes the rows and error history of every other kind, for every user', () => {
    const user = createTestUser().id

    insert( null, 'replication', 'default' )
    insert( null, 'transcription', 'default' )
    insert( null, 'agent', 'default' )
    insert( user, 'vault_sync', 'alex' )
    insert( user, 'feed', 'f1' )

    deleteHealthExcept( [ 'agent', 'feed' ] )

    expect( kinds( 'health_status' ) ).toEqual( [ 'agent', 'feed' ] )
    expect( kinds( 'health_errors' ) ).toEqual( [ 'agent', 'feed' ] )
  } )
} )
