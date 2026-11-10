
CREATE TABLE transcription_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  model TEXT NOT NULL,
  audio_seconds INTEGER NOT NULL,
  pieces INTEGER NOT NULL,
  cost_usd REAL,
  outcome TEXT NOT NULL CHECK ( outcome IN ( 'ok', 'error' ) ),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX transcription_runs_user ON transcription_runs ( user_id, created_at );

DROP VIEW usage_events;
CREATE VIEW usage_events AS
  SELECT user_id, 'summary' AS category, input_tokens, output_tokens, cost_usd, created_at
    FROM summary_runs
  UNION ALL
  SELECT user_id, 'linking', input_tokens, output_tokens, cost_usd, created_at FROM link_runs
  UNION ALL
  SELECT user_id, 'melete', input_tokens, output_tokens, cost_usd, created_at FROM melete_runs
  UNION ALL
  SELECT user_id, 'extraction', input_tokens, output_tokens, cost_usd, created_at
    FROM extraction_runs
  UNION ALL
  SELECT user_id, 'transcription', NULL, NULL, cost_usd, created_at FROM transcription_runs;

CREATE TABLE health_status_new (
  user_id TEXT REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  failing_since TEXT,
  detail TEXT,
  PRIMARY KEY ( kind, subject_id ),
  CHECK ( ( kind IN ( 'agent', 'whisper', 'backup', 'transcription', 'replication' ) )
    = ( user_id IS NULL ) )
);
INSERT INTO health_status_new SELECT * FROM health_status;
DROP TABLE health_status;
ALTER TABLE health_status_new RENAME TO health_status;

CREATE TABLE health_errors_new (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  at TEXT NOT NULL,
  message TEXT NOT NULL,
  CHECK ( ( kind IN ( 'agent', 'whisper', 'backup', 'transcription', 'replication' ) )
    = ( user_id IS NULL ) )
);
INSERT INTO health_errors_new SELECT * FROM health_errors;
DROP TABLE health_errors;
ALTER TABLE health_errors_new RENAME TO health_errors;
CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );