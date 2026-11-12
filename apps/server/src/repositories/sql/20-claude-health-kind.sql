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
  CHECK ( ( kind IN ( 'agent', 'transcription', 'replication', 'claude' ) ) = ( user_id IS NULL ) )
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
  CHECK ( ( kind IN ( 'agent', 'transcription', 'replication', 'claude' ) ) = ( user_id IS NULL ) )
);
INSERT INTO health_errors_new SELECT * FROM health_errors;
DROP TABLE health_errors;
ALTER TABLE health_errors_new RENAME TO health_errors;
CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );
