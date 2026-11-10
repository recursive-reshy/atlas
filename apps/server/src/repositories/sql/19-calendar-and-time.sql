-- time_entries accepts source 'calendar', and a calendar entry may point at a goal or a subject.
-- SQLite can't alter a CHECK, so the table is rebuilt. No view or trigger names it.
CREATE TABLE time_entries_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK ( source IN ( 'measured', 'logged', 'calendar' ) ),
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  day TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  seconds INTEGER NOT NULL CHECK ( seconds > 0 ),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ( ( subject_id IS NULL ) <> ( goal_id IS NULL ) ),
  CHECK ( source IN ( 'logged', 'calendar' ) OR subject_id IS NOT NULL )
);

INSERT INTO time_entries_new
  SELECT id, user_id, source, subject_id, goal_id, day, started_at, ended_at, seconds, note,
    created_at, updated_at
  FROM time_entries;

DROP TABLE time_entries;
ALTER TABLE time_entries_new RENAME TO time_entries;

CREATE INDEX time_entries_day ON time_entries ( user_id, day );
CREATE INDEX time_entries_open ON time_entries ( user_id, subject_id, source, ended_at );

CREATE TABLE calendar_account (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users ( id ) ON DELETE CASCADE,
  email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  connected_at TEXT NOT NULL,
  calendar_id TEXT,
  calendar_name TEXT,
  import_from TEXT,
  last_synced_at TEXT
);

CREATE TABLE calendar_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ( ( subject_id IS NULL ) <> ( goal_id IS NULL ) )
);
CREATE INDEX calendar_rules_user ON calendar_rules ( user_id, position );

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  day TEXT NOT NULL,
  seconds INTEGER NOT NULL CHECK ( seconds > 0 ),
  status TEXT NOT NULL CHECK ( status IN ( 'draft', 'approved', 'dismissed' ) ),
  subject_id TEXT REFERENCES melete_subjects ( id ) ON DELETE SET NULL,
  goal_id TEXT REFERENCES themis_goals ( id ) ON DELETE SET NULL,
  assigned_by TEXT CHECK ( assigned_by IN ( 'rule', 'hand' ) ),
  rule_id TEXT REFERENCES calendar_rules ( id ) ON DELETE SET NULL,
  note TEXT,
  time_entry_id TEXT REFERENCES time_entries ( id ) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE ( user_id, calendar_id, event_id ),
  CHECK ( subject_id IS NULL OR goal_id IS NULL )
);
CREATE INDEX calendar_events_status ON calendar_events ( user_id, status, day );
