
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
  CHECK ( ( kind IN ( 'agent', 'transcription', 'replication' ) ) = ( user_id IS NULL ) )
);
INSERT INTO health_status_new
  SELECT * FROM health_status WHERE kind NOT IN ( 'whisper', 'backup', 'pot_provider' );
DROP TABLE health_status;
ALTER TABLE health_status_new RENAME TO health_status;

CREATE TABLE health_errors_new (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users ( id ) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  at TEXT NOT NULL,
  message TEXT NOT NULL,
  CHECK ( ( kind IN ( 'agent', 'transcription', 'replication' ) ) = ( user_id IS NULL ) )
);
INSERT INTO health_errors_new
  SELECT * FROM health_errors WHERE kind NOT IN ( 'whisper', 'backup', 'pot_provider' );
DROP TABLE health_errors;
ALTER TABLE health_errors_new RENAME TO health_errors;
CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );

UPDATE jobs
  SET status = 'failed', error = 'Interrupted by upgrade', expires_at = NULL
  WHERE status IN ( 'downloading', 'converting' );

ALTER TABLE transcription_runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE transcription_runs ADD COLUMN output_tokens INTEGER;