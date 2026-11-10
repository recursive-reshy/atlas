
DROP VIEW eligible_users;

CREATE TABLE user_modules_new (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK ( module IN ( 'transcriber', 'melete', 'themis' ) ),
  PRIMARY KEY ( user_id, module )
);
INSERT INTO user_modules_new ( user_id, module ) SELECT user_id, module FROM user_modules;
DROP TABLE user_modules;
ALTER TABLE user_modules_new RENAME TO user_modules;

CREATE VIEW eligible_users AS
  SELECT u.id AS user_id, m.module, u.vault_dir
  FROM users u JOIN ( SELECT 'transcriber' AS module UNION ALL SELECT 'melete' ) m
  WHERE u.status = 'active'
    AND ( u.role = 'admin' OR EXISTS (
      SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module = m.module
    ) );

CREATE TABLE themis_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX themis_areas_name ON themis_areas ( user_id, lower( name ) );

CREATE TABLE themis_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES themis_areas ( id ),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK ( status IN ( 'active', 'achieved', 'dropped' ) ),
  status_changed_at TEXT,
  outcome TEXT NOT NULL CHECK ( outcome IN ( 'learning', 'metric', 'checkin' ) ),
  metric_unit TEXT,
  metric_target REAL,
  checkin_cadence TEXT CHECK ( checkin_cadence IN ( 'weekly', 'monthly' ) ),
  created_at TEXT NOT NULL,
  CHECK ( ( outcome = 'metric' ) = ( metric_target IS NOT NULL ) ),
  CHECK ( ( outcome = 'checkin' ) = ( checkin_cadence IS NOT NULL ) )
);
CREATE INDEX themis_goals_area ON themis_goals ( user_id, area_id, position );

CREATE TABLE themis_metric_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  value REAL NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);
CREATE TABLE themis_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES themis_goals ( id ) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK ( rating BETWEEN 1 AND 5 ),
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE ( goal_id, period_start )
);

ALTER TABLE melete_subjects ADD COLUMN goal_id TEXT
  REFERENCES themis_goals ( id ) ON DELETE SET NULL;

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK ( source IN ( 'measured', 'logged' ) ),
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
  CHECK ( source = 'logged' OR subject_id IS NOT NULL )
);
CREATE INDEX time_entries_day ON time_entries ( user_id, day );
CREATE INDEX time_entries_open ON time_entries ( user_id, subject_id, source, ended_at );