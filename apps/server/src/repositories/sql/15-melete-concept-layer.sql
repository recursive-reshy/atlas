
ALTER TABLE melete_subjects ADD COLUMN target_level TEXT
  CHECK ( target_level IN ( 'awareness', 'working', 'proficient', 'expert' ) );
ALTER TABLE melete_subjects ADD COLUMN intent TEXT;
ALTER TABLE melete_subjects ADD COLUMN syllabus_status TEXT NOT NULL DEFAULT 'none'
  CHECK ( syllabus_status IN ( 'none', 'drafting', 'draft', 'approved', 'failed' ) );
ALTER TABLE melete_subjects ADD COLUMN syllabus_error TEXT;

CREATE TABLE melete_sections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE melete_concepts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES melete_sections ( id ) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX melete_concepts_subject ON melete_concepts ( subject_id, section_id, position );

CREATE TABLE melete_note_concepts (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES melete_notes ( id ) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES melete_concepts ( id ) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK ( source IN ( 'claude', 'hand' ) ),
  PRIMARY KEY ( note_id, concept_id )
);
CREATE INDEX melete_note_concepts_concept ON melete_note_concepts ( concept_id );

ALTER TABLE melete_notes ADD COLUMN mapping TEXT NOT NULL DEFAULT 'idle'
  CHECK ( mapping IN ( 'idle', 'queued', 'mapping', 'failed' ) );
ALTER TABLE melete_notes ADD COLUMN mapping_error TEXT;
ALTER TABLE melete_notes ADD COLUMN mapping_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE melete_notes ADD COLUMN off_syllabus TEXT
  CHECK ( off_syllabus IN ( 'flagged', 'dismissed' ) );
ALTER TABLE melete_notes ADD COLUMN off_syllabus_suggestion TEXT;

ALTER TABLE melete_questions ADD COLUMN concept_id TEXT
  REFERENCES melete_concepts ( id ) ON DELETE SET NULL;
CREATE INDEX melete_questions_concept ON melete_questions ( concept_id, state );

ALTER TABLE melete_runs ADD COLUMN subject_id TEXT;