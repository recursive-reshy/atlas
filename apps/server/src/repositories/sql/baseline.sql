CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK ( role IN ( 'admin', 'member' ) ),
  status TEXT NOT NULL CHECK ( status IN ( 'active', 'removed' ) ),
  vault_dir TEXT UNIQUE,
  last_job_started_at TEXT,
  last_generation_started_at TEXT,
  last_signin_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX users_one_admin ON users ( role ) WHERE role = 'admin';

CREATE TABLE user_modules (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK ( module IN ( 'transcriber', 'melete' ) ),
  PRIMARY KEY ( user_id, module )
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions ( user_id );

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIEW eligible_users AS
  SELECT u.id AS user_id, m.module, u.vault_dir
  FROM users u JOIN ( SELECT 'transcriber' AS module UNION ALL SELECT 'melete' ) m
  WHERE u.status = 'active'
    AND ( u.role = 'admin' OR EXISTS (
      SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module = m.module
    ) );

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  title TEXT,
  source_document TEXT,
  saved_path TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  note_markdown TEXT,
  target_folder TEXT,
  summary_model TEXT,
  prompt_profile_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'video',
  feed_id TEXT,
  gmail_source_id TEXT,
  link_state TEXT,
  link_error TEXT,
  duration_seconds INTEGER
);
CREATE INDEX jobs_user_status ON jobs ( user_id, status, created_at );
CREATE INDEX jobs_user_queue ON jobs ( user_id, status );

CREATE TABLE settings (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY ( user_id, key )
);

CREATE TABLE prompt_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed_key TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  purpose TEXT NOT NULL DEFAULT 'summary',
  last_folder TEXT
);
CREATE UNIQUE INDEX prompt_profiles_active_name
  ON prompt_profiles ( user_id, purpose, lower( name ) ) WHERE deleted_at IS NULL;

CREATE TABLE prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES prompt_profiles ( id ),
  version INTEGER NOT NULL,
  guidance TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE ( profile_id, version )
);

CREATE TABLE summary_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX summary_runs_job ON summary_runs ( job_id, id );

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_summarize INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  last_skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX feeds_active_url
  ON feeds ( user_id, feed_url ) WHERE deleted_at IS NULL;

CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  feed_id TEXT NOT NULL REFERENCES feeds ( id ),
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  published_at TEXT,
  author TEXT,
  content_markdown TEXT,
  status TEXT NOT NULL,
  job_id TEXT,
  added_at TEXT NOT NULL,
  UNIQUE ( feed_id, item_key )
);
CREATE INDEX feed_items_inbox ON feed_items ( user_id, status, added_at );

CREATE TABLE gmail_account (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users ( id ) ON DELETE CASCADE,
  email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  connected_at TEXT NOT NULL
);

CREATE TABLE gmail_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match_kind TEXT NOT NULL,
  label_ids TEXT,
  query TEXT,
  destination TEXT NOT NULL,
  profile_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_summarize INTEGER NOT NULL DEFAULT 0,
  sync_from TEXT NOT NULL,
  last_skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE gmail_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES gmail_sources ( id ),
  message_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  received_at TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL,
  backfilled INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  job_id TEXT,
  added_at TEXT NOT NULL,
  UNIQUE ( source_id, message_id )
);
CREATE INDEX gmail_messages_status ON gmail_messages ( user_id, status, added_at );

CREATE TABLE job_postings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_job_id TEXT,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  posted_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  details TEXT NOT NULL,
  UNIQUE ( user_id, dedupe_key )
);
CREATE INDEX job_postings_seen ON job_postings ( user_id, first_seen_at );

CREATE TABLE posting_sightings (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  posting_id TEXT NOT NULL REFERENCES job_postings ( id ),
  gmail_message_row TEXT NOT NULL REFERENCES gmail_messages ( id ),
  seen_at TEXT NOT NULL,
  PRIMARY KEY ( posting_id, gmail_message_row )
);

CREATE TABLE extraction_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  gmail_message_row TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,
  postings_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE link_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  cache_creation_input_tokens INTEGER,
  tool_calls INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX link_runs_job ON link_runs ( job_id, id );

CREATE TABLE link_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES link_runs ( id ),
  position INTEGER NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL,
  anchor TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX link_suggestions_job ON link_suggestions ( job_id, status, position );

CREATE TABLE health_status (
  user_id TEXT REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  failing_since TEXT,
  detail TEXT,
  PRIMARY KEY ( kind, subject_id ),
  CHECK ( ( kind IN ( 'agent', 'whisper', 'backup' ) ) = ( user_id IS NULL ) )
);

CREATE TABLE health_errors (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  at TEXT NOT NULL,
  message TEXT NOT NULL,
  CHECK ( ( kind IN ( 'agent', 'whisper', 'backup' ) ) = ( user_id IS NULL ) )
);
CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );

CREATE TABLE melete_subjects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  auto_enroll INTEGER NOT NULL DEFAULT 0,
  new_per_day INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  UNIQUE ( user_id, folder )
);

CREATE TABLE melete_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ),
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size INTEGER NOT NULL,
  enrolled INTEGER NOT NULL DEFAULT 0,
  enrolled_at TEXT,
  generation TEXT NOT NULL DEFAULT 'idle',
  generation_error TEXT,
  missing_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX melete_notes_path
  ON melete_notes ( user_id, path ) WHERE missing_at IS NULL;
CREATE INDEX melete_notes_hash ON melete_notes ( user_id, body_hash );
CREATE INDEX melete_notes_queue ON melete_notes ( user_id, generation, enrolled_at );

CREATE TABLE melete_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES melete_notes ( id ),
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  passage TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  due TEXT,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  fsrs_state TEXT NOT NULL DEFAULT 'new',
  last_review TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX melete_questions_note ON melete_questions ( note_id, state, position );
CREATE INDEX melete_questions_due ON melete_questions ( user_id, state, due );

CREATE TABLE melete_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES melete_questions ( id ),
  reviewed_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  rating TEXT NOT NULL,
  suggested_rating TEXT,
  answer TEXT,
  grade_run_id INTEGER,
  was_new INTEGER NOT NULL,
  before_state TEXT NOT NULL
);
CREATE INDEX melete_reviews_question ON melete_reviews ( question_id, reviewed_at );
CREATE INDEX melete_reviews_day ON melete_reviews ( user_id, reviewed_at );

CREATE TABLE melete_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  note_id TEXT,
  question_id TEXT,
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX melete_runs_note ON melete_runs ( note_id, id );

CREATE VIEW usage_events AS
  SELECT user_id, 'summary' AS category, input_tokens, output_tokens, cost_usd, created_at
    FROM summary_runs
  UNION ALL
  SELECT user_id, 'linking', input_tokens, output_tokens, cost_usd, created_at FROM link_runs
  UNION ALL
  SELECT user_id, 'melete', input_tokens, output_tokens, cost_usd, created_at FROM melete_runs
  UNION ALL
  SELECT user_id, 'extraction', input_tokens, output_tokens, cost_usd, created_at
    FROM extraction_runs;