// Node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
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
  vi,
} from 'vitest'
// Services
// Test support
import { createTestUser } from '../test-support/auth.js'
// Repositories
import {
  SCHEMA_BASE,
  closeDatabase,
  getDatabase,
  inTransaction,
  migrations,
  openDatabase,
  runMigrations,
} from './database.js'

const CURRENT_VERSION = SCHEMA_BASE + migrations.length

describe( 'openDatabase and closeDatabase', () => {
  let directory = ''
  let databasePath = ''

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'atlas-store-' ) )
    databasePath = join( directory, 'atlas.db' )
  } )

  afterEach( () => {
    closeDatabase()
    rmSync( directory, { recursive: true, force: true } )
  } )

  const inspect = < Result >( read: ( database: Database.Database ) => Result ): Result => {
    const database = new Database( databasePath, { readonly: true } )

    try {
      return read( database )
    } finally {
      database.close()
    }
  }

  it( 'records the number of applied migrations in user_version', () => {
    openDatabase( databasePath )

    const version = inspect( ( database ) => database.pragma( 'user_version', { simple: true } ) )

    expect( version ).toBe( CURRENT_VERSION )
  } )

  it( 'turns on WAL mode', () => {
    openDatabase( databasePath )

    const mode = inspect( ( database ) => database.pragma( 'journal_mode', { simple: true } ) )

    expect( mode ).toBe( 'wal' )
  } )

  it( 'keeps existing rows and the version when opened again', () => {
    openDatabase( databasePath )
    closeDatabase()
    const writer = new Database( databasePath )
    writer.prepare( `INSERT INTO users ( id, email, name, role, status, created_at )
      VALUES ( 'u', 'u@x.test', 'U', 'member', 'active', 'now' )` ).run()
    writer
      .prepare( `INSERT INTO jobs ( id, user_id, url, status, created_at, updated_at )
        VALUES ( 'a', 'u', 'https://example.com', 'queued', 'now', 'now' )` )
      .run()
    writer.close()

    openDatabase( databasePath )

    const result = inspect( ( database ) => ( {
      rows: database.prepare( 'SELECT COUNT(*) AS count FROM jobs' ).get(),
      version: database.pragma( 'user_version', { simple: true } ),
    } ) )

    expect( result ).toEqual( { rows: { count: 1 }, version: CURRENT_VERSION } )
  } )

  it( 'closes the previous store when opened twice', () => {
    openDatabase( databasePath )

    expect( () => openDatabase( databasePath ) ).not.toThrow()
  } )

  it( 'can be closed when nothing is open', () => {
    expect( () => closeDatabase() ).not.toThrow()
  } )

  describe( 'a database from a newer version', () => {
    const newer = CURRENT_VERSION + 1

    beforeEach( () => {
      const database = new Database( databasePath )

      database.pragma( `user_version = ${ newer }` )
      database.close()
    } )

    it( 'is refused with a message naming both schema versions', () => {
      expect( () => openDatabase( databasePath ) ).toThrow(
        `This database is from a newer version of Atlas (schema ${ newer }, `
        + `this version knows ${ CURRENT_VERSION }). `
        + 'Restore an older backup or upgrade the app.',
      )
    } )

    it( 'leaves no open store and does not change the file', () => {
      const before = readFileSync( databasePath )

      expect( () => openDatabase( databasePath ) ).toThrow()
      expect( () => getDatabase() ).toThrow( 'Database is not open' )
      expect( readFileSync( databasePath ).equals( before ) ).toBe( true )
      expect( existsSync( `${ databasePath }-wal` ) ).toBe( false )
    } )
  } )

  it( 'opens a database at the current version', () => {
    openDatabase( databasePath )
    closeDatabase()

    expect( () => openDatabase( databasePath ) ).not.toThrow()
  } )
} )

describe( 'runMigrations', () => {
  it( 'numbers migrations from SCHEMA_BASE and reads that as the stored version', () => {
    expect( SCHEMA_BASE ).toBe( 9 )
    expect( migrations.length ).toBeGreaterThanOrEqual( 4 )
  } )

  const version = ( database: Database.Database ): unknown => {
    return database.pragma( 'user_version', { simple: true } )
  }

  it( 'runs SQL strings and functions in order and records the version', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, [
      'CREATE TABLE t ( id INTEGER )',
      ( db ) => {
        db.exec( 'ALTER TABLE t ADD COLUMN name TEXT' )
        db.prepare( 'INSERT INTO t ( id, name ) VALUES ( 1, ? )' ).run( 'a' )
      },
    ] )

    expect( database.prepare( 'SELECT id, name FROM t' ).all() ).toEqual( [ { id: 1, name: 'a' } ] )
    expect( version( database ) ).toBe( SCHEMA_BASE + 2 )
  } )

  it( 'skips migrations that were already applied', () => {
    const database = new Database( ':memory:' )
    const second = vi.fn()

    runMigrations( database, [ 'CREATE TABLE t ( id INTEGER )' ] )
    runMigrations( database, [ 'CREATE TABLE t ( id INTEGER )', second ] )

    expect( second ).toHaveBeenCalledTimes( 1 )
    expect( version( database ) ).toBe( SCHEMA_BASE + 2 )
  } )

  it( 'rolls everything back when a function migration throws', () => {
    const database = new Database( ':memory:' )

    expect( () => runMigrations( database, [
      'CREATE TABLE t ( id INTEGER )',
      () => {
        throw new Error( 'backfill failed' )
      },
    ] ) ).toThrow( 'backfill failed' )

    expect( version( database ) ).toBe( 0 )
    expect( database.prepare( 'SELECT name FROM sqlite_master WHERE name = ?' ).get( 't' ) )
      .toBeUndefined()
  } )
} )

describe( 'getDatabase', () => {
  it( 'throws a clear error when the database is not open', () => {
    closeDatabase()

    expect( () => getDatabase() ).toThrow( 'Database is not open' )
  } )

  it( 'returns the open handle', () => {
    openDatabase( ':memory:' )

    expect( getDatabase().open ).toBe( true )
  } )
} )


const BASELINE_COLUMNS: Record< string, string[] > = {
  jobs: [
    'id',
    'user_id',
    'url',
    'status',
    'error',
    'title',
    'source_document',
    'saved_path',
    'expires_at',
    'created_at',
    'updated_at',
    'note_markdown',
    'target_folder',
    'summary_model',
    'prompt_profile_id',
    'source_type',
    'feed_id',
    'gmail_source_id',
    'link_state',
    'link_error',
    'duration_seconds',
  ],
  settings: [
    'user_id',
    'key',
    'value',
  ],
  prompt_profiles: [
    'id',
    'user_id',
    'name',
    'seed_key',
    'created_at',
    'deleted_at',
    'purpose',
    'last_folder',
  ],
  prompt_versions: [
    'id',
    'user_id',
    'profile_id',
    'version',
    'guidance',
    'source',
    'created_at',
  ],
  summary_runs: [
    'id',
    'user_id',
    'job_id',
    'model',
    'prompt_version_id',
    'input_tokens',
    'output_tokens',
    'cost_usd',
    'outcome',
    'error',
    'created_at',
  ],
  feeds: [
    'id',
    'user_id',
    'url',
    'feed_url',
    'name',
    'profile_id',
    'enabled',
    'auto_summarize',
    'etag',
    'last_modified',
    'last_skipped_count',
    'created_at',
    'deleted_at',
  ],
  feed_items: [
    'id',
    'user_id',
    'feed_id',
    'item_key',
    'title',
    'link',
    'published_at',
    'author',
    'content_markdown',
    'status',
    'job_id',
    'added_at',
  ],
  gmail_account: [
    'user_id',
    'email',
    'refresh_token_enc',
    'scope',
    'status',
    'error',
    'connected_at',
  ],
  gmail_sources: [
    'id',
    'user_id',
    'name',
    'match_kind',
    'label_ids',
    'query',
    'destination',
    'profile_id',
    'enabled',
    'auto_summarize',
    'sync_from',
    'last_skipped_count',
    'created_at',
    'deleted_at',
  ],
  gmail_messages: [
    'id',
    'user_id',
    'source_id',
    'message_id',
    'subject',
    'sender',
    'sender_address',
    'received_at',
    'body_html',
    'body_text',
    'status',
    'backfilled',
    'attempts',
    'error',
    'job_id',
    'added_at',
  ],
  job_postings: [
    'id',
    'user_id',
    'platform',
    'platform_job_id',
    'dedupe_key',
    'title',
    'url',
    'posted_at',
    'first_seen_at',
    'last_seen_at',
    'details',
  ],
  posting_sightings: [
    'user_id',
    'posting_id',
    'gmail_message_row',
    'seen_at',
  ],
  extraction_runs: [
    'id',
    'user_id',
    'gmail_message_row',
    'model',
    'input_tokens',
    'output_tokens',
    'cost_usd',
    'outcome',
    'postings_count',
    'error',
    'created_at',
  ],
  transcription_runs: [
    'id',
    'user_id',
    'job_id',
    'model',
    'duration_seconds',
    'cost_usd',
    'outcome',
    'error',
    'created_at',
    'input_tokens',
    'output_tokens',
  ],
  link_runs: [
    'id',
    'user_id',
    'job_id',
    'model',
    'prompt_version_id',
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
    'tool_calls',
    'cost_usd',
    'outcome',
    'error',
    'created_at',
  ],
  link_suggestions: [
    'id',
    'user_id',
    'job_id',
    'run_id',
    'position',
    'target',
    'kind',
    'anchor',
    'reason',
    'status',
    'decided_at',
  ],
  health_status: [
    'user_id',
    'kind',
    'subject_id',
    'last_checked_at',
    'last_success_at',
    'last_error',
    'failing_since',
    'detail',
  ],
  health_errors: [
    'id',
    'user_id',
    'kind',
    'subject_id',
    'at',
    'message',
  ],
  melete_subjects: [
    'id',
    'user_id',
    'folder',
    'auto_enroll',
    'new_per_day',
    'created_at',
    'target_level',
    'intent',
    'syllabus_status',
    'syllabus_error',
    'goal_id',
  ],
  melete_notes: [
    'id',
    'user_id',
    'subject_id',
    'path',
    'title',
    'body_hash',
    'mtime_ms',
    'size',
    'enrolled',
    'enrolled_at',
    'generation',
    'generation_error',
    'missing_at',
    'created_at',
    'mapping',
    'mapping_error',
    'mapping_pinned',
    'off_syllabus',
    'off_syllabus_suggestion',
  ],
  melete_questions: [
    'id',
    'user_id',
    'note_id',
    'position',
    'prompt',
    'answer',
    'passage',
    'body_hash',
    'state',
    'run_id',
    'due',
    'stability',
    'difficulty',
    'scheduled_days',
    'learning_steps',
    'reps',
    'lapses',
    'fsrs_state',
    'last_review',
    'created_at',
    'concept_id',
  ],
  melete_reviews: [
    'id',
    'user_id',
    'question_id',
    'reviewed_at',
    'mode',
    'rating',
    'suggested_rating',
    'answer',
    'grade_run_id',
    'was_new',
    'before_state',
  ],
  melete_runs: [
    'id',
    'user_id',
    'kind',
    'note_id',
    'question_id',
    'model',
    'prompt_version_id',
    'input_tokens',
    'output_tokens',
    'cost_usd',
    'outcome',
    'error',
    'created_at',
    'subject_id',
    'turns',
    'tool_calls',
  ],
  melete_sections: [ 'id', 'user_id', 'subject_id', 'position', 'name', 'created_at' ],
  melete_concepts: [
    'id',
    'user_id',
    'subject_id',
    'section_id',
    'position',
    'name',
    'description',
    'created_at',
  ],
  melete_note_concepts: [ 'user_id', 'note_id', 'concept_id', 'source' ],
  themis_areas: [ 'id', 'user_id', 'name', 'position', 'created_at' ],
  themis_goals: [
    'id',
    'user_id',
    'area_id',
    'name',
    'position',
    'target_date',
    'status',
    'status_changed_at',
    'outcome',
    'metric_unit',
    'metric_target',
    'checkin_cadence',
    'created_at',
  ],
  themis_metric_updates: [ 'id', 'user_id', 'goal_id', 'value', 'note', 'at' ],
  calendar_account: [
    'user_id',
    'email',
    'refresh_token_enc',
    'scope',
    'status',
    'error',
    'connected_at',
    'calendar_id',
    'calendar_name',
    'import_from',
    'last_synced_at',
  ],
  calendar_rules: [
    'id',
    'user_id',
    'phrase',
    'subject_id',
    'goal_id',
    'position',
    'created_at',
    'updated_at',
  ],
  calendar_events: [
    'id',
    'user_id',
    'calendar_id',
    'event_id',
    'title',
    'started_at',
    'ended_at',
    'day',
    'seconds',
    'status',
    'subject_id',
    'goal_id',
    'assigned_by',
    'rule_id',
    'note',
    'time_entry_id',
    'created_at',
    'updated_at',
  ],
  themis_checkins: [ 'id', 'user_id', 'goal_id', 'period_start', 'rating', 'note', 'created_at' ],
  time_entries: [
    'id',
    'user_id',
    'source',
    'subject_id',
    'goal_id',
    'day',
    'started_at',
    'ended_at',
    'seconds',
    'note',
    'created_at',
    'updated_at',
  ],
  users: [
    'id',
    'email',
    'google_sub',
    'name',
    'role',
    'status',
    'vault_dir',
    'last_job_started_at',
    'last_generation_started_at',
    'last_signin_at',
    'created_at',
  ],
  user_modules: [ 'user_id', 'module' ],
  sessions: [ 'token_hash', 'user_id', 'created_at', 'last_seen_at', 'expires_at' ],
  app_settings: [ 'key', 'value' ],
}

const BASELINE_INDEXES = [
  'users_one_admin',
  'sessions_user',
  'jobs_user_status',
  'jobs_user_queue',
  'summary_runs_job',
  'feeds_active_url',
  'feed_items_inbox',
  'gmail_messages_status',
  'job_postings_seen',
  'prompt_profiles_active_name',
  'link_runs_job',
  'link_suggestions_job',
  'health_errors_subject',
  'melete_notes_path',
  'melete_notes_hash',
  'melete_notes_queue',
  'melete_questions_note',
  'melete_questions_due',
  'melete_reviews_question',
  'melete_reviews_day',
  'melete_runs_note',
  'melete_concepts_subject',
  'melete_note_concepts_concept',
  'melete_questions_concept',
  'transcription_runs_user',
  'themis_areas_name',
  'themis_goals_area',
  'time_entries_day',
  'time_entries_open',
  'calendar_rules_user',
  'calendar_events_status',
]

describe( 'the baseline schema', () => {
  beforeEach( () => {
    openDatabase( ':memory:' )
  } )

  afterEach( () => {
    closeDatabase()
  } )

  const columnsOf = ( table: string ): string[] => {
    return ( getDatabase().pragma( `table_info(${ table })` ) as { name: string }[] )
      .map( ( { name } ) => name )
  }

  it( 'stores the latest schema version on an empty database', () => {
    expect( getDatabase().pragma( 'user_version', { simple: true } ) ).toBe( CURRENT_VERSION )
  } )

  it( 'creates exactly the 0.8 tables, unchanged, and the four user tables', () => {
    const tables = getDatabase()
      .prepare( "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'" )
      .all()
      .map( ( row ) => ( row as { name: string } ).name )

    expect( tables.sort() ).toEqual( [ ...Object.keys( BASELINE_COLUMNS ) ].sort() )
  } )

  it.each( Object.entries( BASELINE_COLUMNS ) )( 'gives %s its columns', ( table, columns ) => {
    expect( columnsOf( table ) ).toEqual( columns )
  } )

  it( 'creates every index', () => {
    const indexes = getDatabase()
      .prepare( "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'" )
      .all()
      .map( ( row ) => ( row as { name: string } ).name )

    expect( indexes.sort() ).toEqual( [ ...BASELINE_INDEXES ].sort() )
  } )

  it( 'creates the eligible_users and usage_events views', () => {
    const view = getDatabase()
      .prepare( "SELECT name FROM sqlite_master WHERE type = 'view'" )
      .all()
      .map( ( row ) => ( row as { name: string } ).name )

    expect( view.sort() ).toEqual( [ 'eligible_users', 'usage_events' ] )
  } )

  it( 'seeds nothing itself', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations )

    expect( database.prepare( 'SELECT COUNT(*) AS count FROM prompt_profiles' ).get() )
      .toEqual( { count: 0 } )
    expect( database.prepare( 'SELECT COUNT(*) AS count FROM settings' ).get() )
      .toEqual( { count: 0 } )
  } )

  describe( 'users', () => {
    const insertUser = ( id: string, role: string, status = 'active' ): void => {
      getDatabase().prepare( `INSERT INTO users ( id, email, name, role, status, created_at )
        VALUES ( ?, ?, 'N', ?, ?, 'now' )` ).run( id, `${ id }@example.com`, role, status )
    }

    it( 'allows one admin and any number of members', () => {
      insertUser( 'a', 'admin' )
      insertUser( 'b', 'member' )
      insertUser( 'c', 'member' )

      expect( () => insertUser( 'd', 'admin' ) ).toThrow( /UNIQUE/ )
    } )

    it( 'rejects an unknown role or status', () => {
      expect( () => insertUser( 'a', 'owner' ) ).toThrow( /CHECK/ )
      expect( () => insertUser( 'a', 'member', 'banned' ) ).toThrow( /CHECK/ )
    } )

    it( 'keeps emails and vault folders unique', () => {
      insertUser( 'a', 'member' )

      expect( () => insertUser( 'a', 'member' ) ).toThrow( /UNIQUE|PRIMARY/ )

      const set = getDatabase().prepare( 'UPDATE users SET vault_dir = ? WHERE id = ?' )

      insertUser( 'b', 'member' )
      set.run( 'shared', 'a' )

      expect( () => set.run( 'shared', 'b' ) ).toThrow( /UNIQUE/ )
    } )

    it( 'allows many users with no vault or Google subject yet', () => {
      insertUser( 'a', 'member' )
      insertUser( 'b', 'member' )

      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM users' ).get() )
        .toEqual( { count: 2 } )
    } )

    it( 'keeps a module once per user, names none itself, and removes them with the user', () => {
      insertUser( 'a', 'member' )

      const add = getDatabase()
        .prepare( 'INSERT INTO user_modules ( user_id, module ) VALUES ( ?, ? )' )

      add.run( 'a', 'melete' )

      expect( () => add.run( 'a', 'melete' ) ).toThrow( /UNIQUE|PRIMARY/ )
      expect( () => add.run( 'a', 'wealth' ) ).not.toThrow()

      getDatabase().prepare( 'DELETE FROM users WHERE id = ?' ).run( 'a' )

      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM user_modules' ).get() )
        .toEqual( { count: 0 } )
    } )

    it( 'removes sessions with the user', () => {
      insertUser( 'a', 'member' )
      getDatabase().prepare( `INSERT INTO sessions
        ( token_hash, user_id, created_at, last_seen_at, expires_at )
        VALUES ( 'h', 'a', 'now', 'now', 'later' )` ).run()
      getDatabase().prepare( 'DELETE FROM users WHERE id = ?' ).run( 'a' )

      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM sessions' ).get() )
        .toEqual( { count: 0 } )
    } )

    it( 'lists an active member once per module they have in eligible_users, not the admin', () => {
      insertUser( 'a', 'admin' )
      insertUser( 'b', 'member' )
      insertUser( 'c', 'member', 'removed' )
      getDatabase().prepare( `INSERT INTO user_modules ( user_id, module )
        VALUES ( 'b', 'melete' ), ( 'c', 'melete' )` ).run()

      const rows = getDatabase()
        .prepare( 'SELECT user_id, module FROM eligible_users ORDER BY user_id, module' )
        .all()

      expect( rows ).toEqual( [ { user_id: 'b', module: 'melete' } ] )
    } )
  } )

  describe( 'foreign keys', () => {
    it( 'are enforced', () => {
      expect( getDatabase().pragma( 'foreign_keys', { simple: true } ) ).toBe( 1 )
      expect( () => getDatabase().prepare( `INSERT INTO prompt_versions
        ( user_id, profile_id, version, guidance, source, created_at )
        VALUES ( ?, 'nope', 1, 'g', 'seed', 'now' )` )
        .run( createTestUser().id ) ).toThrow( /FOREIGN KEY/ )
      expect( () => getDatabase().prepare( `INSERT INTO settings ( user_id, key, value )
        VALUES ( 'nobody', 'k', '1' )` ).run() ).toThrow( /FOREIGN KEY/ )
    } )

    it( 'report nothing in foreign_key_check on a fresh database', () => {
      expect( getDatabase().pragma( 'foreign_key_check' ) ).toEqual( [] )
    } )
  } )

  describe( 'constraints carried over from 0.8', () => {
    const addProfile = ( id: string, name: string, deleted: string | null = null ): void => {
      getDatabase().prepare( `INSERT INTO prompt_profiles
        ( id, user_id, name, created_at, deleted_at ) VALUES ( ?, ?, ?, 'now', ? )` )
        .run( id, owner, name, deleted )
    }

    let owner = ''

    beforeEach( () => {
      owner = createTestUser().id
    } )

    it( 'rejects a second active profile whose name differs only in case', () => {
      addProfile( 'a', 'Notes' )

      expect( () => addProfile( 'b', 'notes' ) ).toThrow( /UNIQUE/ )
    } )

    it( 'allows a name to be reused once its profile is deleted', () => {
      addProfile( 'a', 'Notes', 'then' )

      expect( () => addProfile( 'b', 'notes' ) ).not.toThrow()
    } )

    it( 'allows one active feed per feed_url, and reuse after a soft delete', () => {
      const owner = createTestUser().id
      const add = ( id: string, deleted: string | null ): void => {
        getDatabase().prepare( `INSERT INTO feeds
          ( id, user_id, url, feed_url, name, created_at, deleted_at )
          VALUES ( ?, ?, 'u', 'https://x/feed', 'n', 'now', ? )` ).run( id, owner, deleted )
      }

      add( 'a', null )

      expect( () => add( 'b', null ) ).toThrow( /UNIQUE/ )
      expect( () => add( 'c', 'then' ) ).not.toThrow()
    } )

    it( 'allows the same melete note path twice only when one is missing', () => {
      const owner = createTestUser().id

      getDatabase().prepare( `INSERT INTO melete_subjects ( id, user_id, folder, created_at )
        VALUES ( 's', ?, 'F', 'now' )` ).run( owner )

      const add = ( id: string, missing: string | null ): void => {
        getDatabase().prepare( `INSERT INTO melete_notes
          ( id, user_id, subject_id, path, title, body_hash, mtime_ms, size, missing_at,
            created_at )
          VALUES ( ?, ?, 's', 'F/a.md', 't', 'h', 1, 1, ?, 'now' )` ).run( id, owner, missing )
      }

      add( 'a', null )

      expect( () => add( 'b', null ) ).toThrow( /UNIQUE/ )
      expect( () => add( 'c', 'then' ) ).not.toThrow()
    } )

    it( 'lets summary runs outlive their job', () => {
      const { id: userId } = createTestUser()

      const version = getDatabase().prepare( 'SELECT id FROM prompt_versions LIMIT 1' )
        .get() as { id: number }

      expect( () => getDatabase().prepare( `INSERT INTO summary_runs
        ( user_id, job_id, model, prompt_version_id, outcome, created_at )
        VALUES ( ?, 'gone', 'm', ?, 'ok', 'now' )` ).run( userId, version.id ) ).not.toThrow()
    } )
  } )
} )

describe( 'the PO token provider migration (schema 12, ADR 0080)', () => {
  const kindOf = ( database: Database.Database, kind: string, userId: string | null ): void => {
    database.prepare( `INSERT INTO health_status ( user_id, kind, subject_id )
      VALUES ( ?, ?, 'default' )` ).run( userId, kind )
  }

  it( 'upgrades a schema 11 database, keeps its health rows and accepts the new kind', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 2 ) )
    database.pragma( 'foreign_keys = OFF' )
    kindOf( database, 'replication', null )
    database.prepare( `INSERT INTO health_errors ( user_id, kind, subject_id, at, message )
      VALUES ( NULL, 'replication', 'default', 'now', 'boom' )` ).run()
    expect( () => kindOf( database, 'pot_provider', null ) ).toThrow()

    runMigrations( database, migrations.slice( 0, 3 ) )

    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 12 )
    expect( database.prepare( 'SELECT kind FROM health_status' ).pluck().all() )
      .toEqual( [ 'replication' ] )
    expect( database.prepare( 'SELECT message FROM health_errors' ).pluck().all() )
      .toEqual( [ 'boom' ] )
    expect( () => kindOf( database, 'pot_provider', null ) ).not.toThrow()
    const insertError = database.prepare( `INSERT INTO health_errors
      ( user_id, kind, subject_id, at, message )
      VALUES ( NULL, 'pot_provider', 'default', 'now', 'x' )` )

    expect( () => insertError.run() ).not.toThrow()
  } )

  it( 'still ties an app kind to a null user and a user kind to a user', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 3 ) )
    database.pragma( 'foreign_keys = OFF' )

    expect( () => kindOf( database, 'pot_provider', 'someone' ) ).toThrow()
    expect( () => kindOf( database, 'feed', null ) ).toThrow()
  } )

  it( 'keeps the health indexes and the table columns', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations )

    const columns = ( database.pragma( 'table_info(health_status)' ) as { name: string }[] )
      .map( ( { name } ) => name )

    const index = database
      .prepare( "SELECT name FROM sqlite_master WHERE name = 'health_errors_subject'" )
      .all()

    expect( index ).toHaveLength( 1 )
    expect( columns ).toEqual( [
      'user_id',
      'kind',
      'subject_id',
      'last_checked_at',
      'last_success_at',
      'last_error',
      'failing_since',
      'detail',
    ] )
  } )
} )

describe( 'a fresh database', () => {
  it( 'seeds nothing: profiles and settings come from seedUser', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations )

    expect( database.prepare( 'SELECT COUNT(*) AS count FROM prompt_profiles' ).get() )
      .toEqual( { count: 0 } )
    expect( database.prepare( 'SELECT COUNT(*) AS count FROM settings' ).get() )
      .toEqual( { count: 0 } )
  } )
} )

describe( 'inTransaction', () => {
  let owner = ''

  beforeEach( () => {
    owner = createTestUser().id
  } )

  const count = (): number => {
    return ( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM settings' ).get() as {
      count: number
    } ).count
  }

  const add = ( key: string ): void => {
    getDatabase().prepare( 'INSERT INTO settings ( user_id, key, value ) VALUES ( ?, ?, \'1\' )' )
      .run( owner, key )
  }

  it( 'returns what the function returns and keeps its writes', () => {
    const before = count()

    expect( inTransaction( () => {
      add( 'a' )
      add( 'b' )

      return 'done'
    } ) ).toBe( 'done' )
    expect( count() ).toBe( before + 2 )
  } )

  it( 'rolls every write back when the function throws, and rethrows', () => {
    const before = count()

    expect( () => inTransaction( () => {
      add( 'a' )
      throw new Error( 'boom' )
    } ) ).toThrow( 'boom' )
    expect( count() ).toBe( before )
  } )

  it( 'can be nested', () => {
    const before = count()

    inTransaction( () => {
      add( 'a' )
      expect( () => inTransaction( () => {
        add( 'b' )
        throw new Error( 'inner' )
      } ) ).toThrow( 'inner' )
    } )

    expect( count() ).toBe( before + 1 )
  } )
} )

