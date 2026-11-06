// Node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Test support
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Repositories
import { closeDatabase, getDatabase, openDatabase } from './database.js'
import { insertLinkRun, listLinkRuns } from './linkRuns.repository.js'
import { insertSuggestions, listSuggestions } from './linkSuggestions.repository.js'
import { findLatestVersion, findProfileBySeedKey } from './promptProfiles.repository.js'
import {
  StoredJob,
  clearJobs,
  deleteJob,
  findJobById,
  insertJob,
  listActiveJobs,
  updateJob,
} from './jobStore.repository.js'
import { claimNextJob } from './system.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

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

beforeEach( () => {
  clearJobs( userId )
} )

describe( 'link fields', () => {
  it( 'round-trips link_state and link_error through insert and update', () => {
    const job = buildJob( { link_state: 'pending' } )
    insertJob( userId, job )

    expect( findJobById( userId, job.id ) )
      .toMatchObject( { link_state: 'pending', link_error: null } )

    updateJob( userId, job.id, { link_state: 'failed', link_error: 'Timed out' } )

    expect( findJobById( userId, job.id ) )
      .toMatchObject( { link_state: 'failed', link_error: 'Timed out' } )
  } )
} )

describe( 'duration_seconds', () => {
  const durationOf = ( id: string ): unknown => {
    return ( getDatabase().prepare( 'SELECT duration_seconds FROM jobs WHERE id = ?' ).get( id ) as
      { duration_seconds: number | null } ).duration_seconds
  }

  it( 'is stored with a video transcript and survives the transcript being cleared', () => {
    const job = buildJob( { source_document: { kind: 'video', ...transcriptFixture } } )

    insertJob( userId, job )

    expect( durationOf( job.id ) ).toBe( transcriptFixture.meta.duration_seconds )

    updateJob( userId, job.id, { source_document: null, status: 'saved' } )

    expect( durationOf( job.id ) ).toBe( transcriptFixture.meta.duration_seconds )
  } )

  it( 'is stored when the transcript arrives on a later update', () => {
    const job = buildJob()

    insertJob( userId, job )

    expect( durationOf( job.id ) ).toBeNull()

    updateJob( userId, job.id, { source_document: { kind: 'video', ...transcriptFixture } } )

    expect( durationOf( job.id ) ).toBe( transcriptFixture.meta.duration_seconds )
  } )

  it( 'stays null for an article', () => {
    const job = buildJob( { source_type: 'article' } )

    insertJob( userId, job )
    updateJob( userId, job.id, { title: 'Changed' } )

    expect( durationOf( job.id ) ).toBeNull()
  } )
} )

describe( 'insertJob and findJobById', () => {
  it( 'returns an equal job after insert', () => {
    const job = buildJob()

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findJobById( userId, 'missing' ) ).toBeUndefined()
  } )

  it( 'throws when the id already exists', () => {
    const job = buildJob()
    insertJob( userId, job )

    expect( () => insertJob( userId, job ) ).toThrow()
  } )
} )

describe( 'updateJob', () => {
  it( 'merges changes and returns the updated job', () => {
    const job = buildJob()
    insertJob( userId, job )

    const updated = updateJob( userId, job.id, { status: 'transcribing' } )

    expect( updated ).toEqual( { ...job, status: 'transcribing' } )
    expect( findJobById( userId, job.id ) ).toEqual( { ...job, status: 'transcribing' } )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateJob( userId, 'missing', { status: 'failed' } ) ).toBeUndefined()
  } )
} )

describe( 'no shared references', () => {
  it( 'ignores mutation of the object passed to insertJob', () => {
    const job = buildJob()
    insertJob( userId, job )

    job.status = 'failed'

    expect( findJobById( userId, job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by findJobById', () => {
    const job = buildJob()
    insertJob( userId, job )

    const found = findJobById( userId, job.id )
    if( found ) found.status = 'failed'

    expect( findJobById( userId, job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by updateJob', () => {
    const job = buildJob()
    insertJob( userId, job )

    const updated = updateJob( userId, job.id, { error: 'x' } )
    if( updated ) updated.error = 'changed'

    expect( findJobById( userId, job.id )?.error ).toBe( 'x' )
  } )

  it( 'ignores mutation of the object returned by claimNextJob', () => {
    const job = buildJob()
    insertJob( userId, job )

    const next = claimNextJob( '2026-10-14T10:00:00.000Z' )
    if( next ) next.status = 'failed'

    expect( findJobById( userId, job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of a nested transcript', () => {
    const transcript = {
      meta: {
        title: 'T',
        source: 'https://example.com/v',
        channel: 'C',
        duration_seconds: 1,
        transcribed_at: '2026-10-14T10:00:00.000Z',
        model: 'm',
      },
      text: 'hi',
    }
    const job = buildJob( { source_document: { kind: 'video', ...transcript } } )
    insertJob( userId, job )

    transcript.meta.title = 'changed'

    expect( findJobById( userId, job.id )?.source_document ).toMatchObject( {
      meta: { title: 'T' },
    } )
  } )
} )

describe( 'source type, feed and source document', () => {
  const article = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: 'https://example.com/post',
      author: null,
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  } as const

  const addFeed = ( id: string, name: string, deletedAt: string | null = null ): void => {
    getDatabase().prepare( `INSERT INTO feeds
      ( id, user_id, url, feed_url, name, created_at, deleted_at )
      VALUES ( ?, ?, 'https://a.example', ?, ?, '2026-10-18T10:00:00.000Z', ? )` )
      .run( id, userId, `https://a.example/${ id }`, name, deletedAt )
  }

  it( 'round-trips an article document, its source type and its feed id', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'A blog' )
    const job = buildJob( {
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
      source_document: article,
    } )

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'defaults to a video job with no feed', () => {
    const job = buildJob()

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toMatchObject( {
      source_type: 'video',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )
  } )

  it( 'stores a video document with its kind', () => {
    const job = buildJob( { source_document: { kind: 'video', ...transcriptFixture } } )
    insertJob( userId, job )

    const { source_document: stored } = getDatabase()
      .prepare( 'SELECT source_document FROM jobs WHERE id = ?' )
      .get( job.id ) as { source_document: string }

    expect( JSON.parse( stored ) ).toMatchObject( { kind: 'video' } )
  } )

  it( 'rejects a stored document with no kind', () => {
    const job = buildJob()
    insertJob( userId, job )
    getDatabase().prepare( 'UPDATE jobs SET source_document = ? WHERE id = ?' )
      .run( JSON.stringify( transcriptFixture ), job.id )

    expect( () => findJobById( userId, job.id ) ).toThrow()
  } )

  it( 'gives every read the feed name from the feeds table', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'A blog' )
    const job = buildJob( { source_type: 'article', feed_id: feedId, feed_name: 'A blog' } )
    insertJob( userId, job )

    expect( findJobById( userId, job.id )?.feed_name ).toBe( 'A blog' )
    expect( listActiveJobs( userId )[ 0 ]?.feed_name ).toBe( 'A blog' )
    expect( claimNextJob( '2026-10-14T10:00:00.000Z' )?.feed_name ).toBe( 'A blog' )
  } )

  it( 'keeps the name of a deleted feed', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'Gone', '2026-10-18T12:00:00.000Z' )
    insertJob( userId, buildJob( { feed_id: feedId, feed_name: 'Gone' } ) )

    expect( listActiveJobs( userId )[ 0 ]?.feed_name ).toBe( 'Gone' )
  } )

  it( 'has no feed name when the feed row is missing', () => {
    const job = buildJob( { feed_id: crypto.randomUUID() } )
    insertJob( userId, job )

    expect( findJobById( userId, job.id )?.feed_name ).toBeNull()
  } )

  it( 'does not write feed_name: it follows the feed', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'Old' )
    const job = buildJob( { feed_id: feedId } )
    insertJob( userId, job )

    getDatabase().prepare( 'UPDATE feeds SET name = ? WHERE id = ?' ).run( 'New', feedId )
    updateJob( userId, job.id, { title: 'T', feed_name: 'Stale' } )

    expect( findJobById( userId, job.id )?.feed_name ).toBe( 'New' )
  } )

  const addGmailSource = ( id: string, name: string, deletedAt: string | null = null ): void => {
    getDatabase().prepare( `INSERT INTO gmail_sources (
        id, user_id, name, match_kind, label_ids, destination, sync_from, created_at, deleted_at
      ) VALUES ( ?, ?, ?, 'labels', '["L1"]', 'newsletter', '2026-10-18T10:00:00.000Z',
        '2026-10-18T10:00:00.000Z', ? )` ).run( id, userId, name, deletedAt )
  }

  it( 'round-trips the Gmail source id and name', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob( {
      source_type: 'article',
      gmail_source_id: sourceId,
      gmail_source_name: 'Lenny',
      source_document: article,
    } )

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'stores the Gmail source id and can change it with updateJob', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob()
    insertJob( userId, job )

    expect( updateJob( userId, job.id, { gmail_source_id: sourceId } )?.gmail_source_id )
      .toBe( sourceId )
    expect( getDatabase().prepare( 'SELECT gmail_source_id FROM jobs WHERE id = ?' ).get( job.id ) )
      .toEqual( { gmail_source_id: sourceId } )
  } )

  it( 'gives every read the Gmail source name from the gmail_sources table', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob( { source_type: 'article', gmail_source_id: sourceId } )
    insertJob( userId, job )

    expect( findJobById( userId, job.id )?.gmail_source_name ).toBe( 'Lenny' )
    expect( listActiveJobs( userId )[ 0 ]?.gmail_source_name ).toBe( 'Lenny' )
    expect( claimNextJob( '2026-10-14T10:00:00.000Z' )?.gmail_source_name ).toBe( 'Lenny' )
  } )

  it( 'keeps the name of a deleted Gmail source', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Gone', '2026-10-18T12:00:00.000Z' )
    insertJob( userId, buildJob( { gmail_source_id: sourceId } ) )

    expect( listActiveJobs( userId )[ 0 ]?.gmail_source_name ).toBe( 'Gone' )
  } )

  it( 'has no Gmail source name when the source row is missing', () => {
    const job = buildJob( { gmail_source_id: crypto.randomUUID() } )
    insertJob( userId, job )

    expect( findJobById( userId, job.id )?.gmail_source_name ).toBeNull()
  } )

  it( 'does not write gmail_source_name: it follows the source', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Old' )
    const job = buildJob( { gmail_source_id: sourceId } )
    insertJob( userId, job )

    getDatabase().prepare( 'UPDATE gmail_sources SET name = ? WHERE id = ?' ).run( 'New', sourceId )
    updateJob( userId, job.id, { title: 'T', gmail_source_name: 'Stale' } )

    expect( findJobById( userId, job.id )?.gmail_source_name ).toBe( 'New' )
  } )
} )

describe( 'clearJobs', () => {
  it( 'empties the store', () => {
    const job = buildJob()
    insertJob( userId, job )

    clearJobs( userId )

    expect( findJobById( userId, job.id ) ).toBeUndefined()
    expect( claimNextJob( '2026-10-14T10:00:00.000Z' ) ).toBeUndefined()
  } )
} )

describe( 'summary choices', () => {
  it( 'round-trips summary_model and prompt_profile_id', () => {
    const job = buildJob( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: crypto.randomUUID(),
    } )

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'defaults both to null', () => {
    const job = buildJob()

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) )
      .toMatchObject( { summary_model: null, prompt_profile_id: null } )
  } )

  it( 'updates both and can clear them', () => {
    const job = buildJob()
    const profileId = crypto.randomUUID()
    insertJob( userId, job )

    updateJob( userId, job.id, { summary_model: 'm', prompt_profile_id: profileId } )

    expect( findJobById( userId, job.id ) ).toMatchObject( {
      summary_model: 'm',
      prompt_profile_id: profileId,
    } )

    updateJob( userId, job.id, { summary_model: null, prompt_profile_id: null } )

    expect( findJobById( userId, job.id ) )
      .toMatchObject( { summary_model: null, prompt_profile_id: null } )
  } )

  it( 'keeps them in listActiveJobs and claimNextJob', () => {
    const job = buildJob( { status: 'summarizing', summary_model: 'm' } )
    insertJob( userId, job )

    expect( listActiveJobs( userId )[ 0 ]?.summary_model ).toBe( 'm' )
    expect( claimNextJob( '2026-10-14T10:00:00.000Z' )?.summary_model ).toBe( 'm' )
  } )
} )

describe( 'storage', () => {
  const transcript = {
    meta: {
      title: 'Ünïcode "quotes" and\nnewlines 日本語',
      source: 'https://www.youtube.com/watch?v=abc',
      channel: 'Some Channel',
      duration_seconds: 60,
      transcribed_at: '2026-10-14T10:04:00.000Z',
      model: 'large-v3',
    },
    text: 'Hello',
  }

  beforeEach( () => {
    openDatabase( ':memory:' )
    userId = createTestUser().id
  } )

  afterEach( () => {
    closeDatabase()
  } )

  it( 'round-trips the transcript and every field', () => {
    const job = buildJob( {
      title: transcript.meta.title,
      expires_at: '2026-10-15T10:00:00.000Z',
      note_markdown: '---\ntitle: "A talk"\n---\n\nText\n',
      target_folder: 'Learning/AI',
      saved_path: 'Mnemosyne/A talk.md',
      source_document: { kind: 'video', ...transcript },
    } )

    insertJob( userId, job )

    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'stores a null source document when an update sets it to null', () => {
    const job = buildJob( { source_document: { kind: 'video', ...transcript } } )
    insertJob( userId, job )

    const updated = updateJob( userId, job.id, { source_document: null } )

    expect( updated?.source_document ).toBeNull()
    expect( findJobById( userId, job.id )?.source_document ).toBeNull()
  } )

  it( 'throws when a stored transcript no longer matches the schema', () => {
    const directory = mkdtempSync( join( tmpdir(), 'atlas-store-' ) )
    const path = join( directory, 'atlas.db' )

    try {
      openDatabase( path )
      userId = createTestUser().id
      const job = buildJob()
      insertJob( userId, job )
      const raw = new Database( path )
      raw.prepare( 'UPDATE jobs SET source_document = ? WHERE id = ?' ).run( '{"nope":1}', job.id )
      raw.close()

      expect( () => findJobById( userId, job.id ) ).toThrow()
    } finally {
      closeDatabase()
      rmSync( directory, { recursive: true, force: true } )
    }
  } )

  it( 'throws a clear error when the store is not open', () => {
    closeDatabase()

    expect( () => findJobById( userId, crypto.randomUUID() ) ).toThrow( 'Database is not open' )
  } )
} )

describe( 'listActiveJobs', () => {
  const active = [
    'queued',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
  ] as const

  it( 'returns in-progress, review and failed-summary jobs only', () => {
    const inactive = [ 'failed', 'saved' ] as const

    for( const status of [ ...active, ...inactive ] ) {
      insertJob( userId, buildJob( { status } ) )
    }

    const statuses = listActiveJobs( userId ).map( ( { status } ) => status )

    expect( statuses.toSorted() ).toEqual( [ ...active ].toSorted() )
  } )

  it( 'returns newest first, breaking ties by insertion order', () => {
    const old = buildJob( { created_at: '2026-10-14T10:00:00.000Z' } )
    const newer = buildJob( { created_at: '2026-10-15T10:00:00.000Z' } )
    const tieFirst = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    const tieSecond = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    for( const job of [ old, newer, tieFirst, tieSecond ] ) {
      insertJob( userId, job )
    }

    expect( listActiveJobs( userId ).map( ( { id } ) => id ) ).toEqual( [
      tieSecond.id,
      tieFirst.id,
      newer.id,
      old.id,
    ] )
  } )

  it( 'returns an empty list for an empty store', () => {
    expect( listActiveJobs( userId ) ).toEqual( [] )
  } )
} )

describe( 'deleteJob', () => {
  it( 'removes the job and reports it', () => {
    const job = buildJob()
    insertJob( userId, job )

    expect( deleteJob( userId, job.id ) ).toBe( true )
    expect( findJobById( userId, job.id ) ).toBeUndefined()
  } )

  it( 'removes the job\'s link runs and suggestions, and only its own', () => {
    const job = buildJob()
    const other = buildJob()
    const linker = findProfileBySeedKey( userId, 'linker' )
    const version = findLatestVersion( userId, linker?.id ?? '' )
    const run = ( jobId: string ): number => insertLinkRun( userId, {
      job_id: jobId,
      model: 'claude-haiku-5-5',
      prompt_version_id: version?.id ?? 0,
      input_tokens: null,
      output_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      tool_calls: null,
      cost_usd: null,
      outcome: 'succeeded',
      error: null,
      created_at: '2026-10-21T10:00:00.000Z',
    } )
    const suggestion = [ {
      target: 'Pricing',
      kind: 'new_concept' as const,
      anchor: null,
      reason: 'Because.',
    } ]
    insertJob( userId, job )
    insertJob( userId, other )
    insertSuggestions( userId, run( job.id ), job.id, suggestion )
    insertSuggestions( userId, run( other.id ), other.id, suggestion )

    deleteJob( userId, job.id )

    expect( listLinkRuns( userId, job.id ) ).toEqual( [] )
    expect( listSuggestions( userId, job.id ) ).toEqual( [] )
    expect( listLinkRuns( userId, other.id ) ).toHaveLength( 1 )
    expect( listSuggestions( userId, other.id ) ).toHaveLength( 1 )
  } )

  it( 'returns false for an unknown id and leaves other jobs alone', () => {
    const other = buildJob()
    insertJob( userId, other )

    expect( deleteJob( userId, 'missing' ) ).toBe( false )
    expect( findJobById( userId, other.id ) ).toEqual( other )
  } )
} )

describe( 'migration 3 on the final table', () => {
  it( 'lets jobs be inserted, updated and read on the final table', () => {
    openDatabase( ':memory:' )
    userId = createTestUser().id
    const job = buildJob( { note_markdown: 'note', target_folder: 'A' } )

    insertJob( userId, job )
    updateJob( userId, job.id, { status: 'ready_for_review', note_markdown: 'edited' } )

    expect( findJobById( userId, job.id ) ).toMatchObject( {
      status: 'ready_for_review',
      note_markdown: 'edited',
      target_folder: 'A',
    } )
  } )
} )

describe( 'ownership', () => {
  it( 'does not show, update or delete another user\'s job', () => {
    const other = createTestUser().id
    const job = buildJob( { status: 'ready_for_review' } )
    insertJob( userId, job )

    expect( findJobById( other, job.id ) ).toBeUndefined()
    expect( updateJob( other, job.id, { title: 'Stolen' } ) ).toBeUndefined()
    expect( deleteJob( other, job.id ) ).toBe( false )
    expect( findJobById( userId, job.id ) ).toEqual( job )
  } )

  it( 'lists only the user\'s own active jobs', () => {
    const other = createTestUser().id
    const mine = buildJob( { status: 'ready_for_review' } )
    const theirs = buildJob( { status: 'ready_for_review' } )
    insertJob( userId, mine )
    insertJob( other, theirs )

    expect( listActiveJobs( userId ).map( ( { id } ) => id ) ).toEqual( [ mine.id ] )
    expect( listActiveJobs( other ).map( ( { id } ) => id ) ).toEqual( [ theirs.id ] )
  } )

  it( 'clears only the user\'s own jobs', () => {
    const other = createTestUser().id
    const theirs = buildJob()
    insertJob( userId, buildJob() )
    insertJob( other, theirs )

    clearJobs( userId )

    expect( listActiveJobs( userId ) ).toEqual( [] )
    expect( findJobById( other, theirs.id ) ).toEqual( theirs )
  } )

  it( 'refuses an id that another user already holds', () => {
    const job = buildJob()
    insertJob( userId, job )

    expect( () => insertJob( createTestUser().id, job ) ).toThrow( 'already exists' )
  } )

  it( 'deleting a job removes its own link runs and suggestions only', () => {
    const other = createTestUser().id
    const mine = buildJob( { status: 'ready_for_review' } )
    const theirs = buildJob( { status: 'ready_for_review' } )
    insertJob( userId, mine )
    insertJob( other, theirs )

    for( const [ owner, job ] of [ [ userId, mine ], [ other, theirs ] ] as const ) {
      const version = findLatestVersion(
        owner,
        findProfileBySeedKey( owner, 'linker' )?.id ?? '',
      )
      const runId = insertLinkRun( owner, {
        job_id: job.id,
        model: 'm',
        prompt_version_id: version?.id ?? 0,
        input_tokens: null,
        output_tokens: null,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
        tool_calls: null,
        cost_usd: null,
        outcome: 'succeeded',
        error: null,
        created_at: '2026-10-21T10:00:00.000Z',
      } )

      insertSuggestions( owner, runId, job.id, [ {
        target: 'T',
        kind: 'new_concept',
        anchor: null,
        reason: 'r',
      } ] )
    }

    deleteJob( userId, mine.id )

    expect( listLinkRuns( userId, mine.id ) ).toEqual( [] )
    expect( listSuggestions( userId, mine.id ) ).toEqual( [] )
    expect( listLinkRuns( other, theirs.id ) ).toHaveLength( 1 )
    expect( listSuggestions( other, theirs.id ) ).toHaveLength( 1 )
  } )
} )
