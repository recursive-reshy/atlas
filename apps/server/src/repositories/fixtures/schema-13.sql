-- Seed for stored schema 13 (the 1.0 baseline, ADR 0085). Plain INSERTs of invented data: no real
-- people, addresses, tokens or notes. Every table has at least one row; a guard test checks it.

INSERT INTO users ( id, email, google_sub, name, role, status, vault_dir, last_job_started_at, last_generation_started_at, last_signin_at, created_at ) VALUES
  ( '00000000-0000-4000-8000-000000000001', 'admin@example.test', 'sub-admin-1', 'Ada Admin', 'admin', 'active', 'ada-vault', '2026-10-01T09:00:00.000Z', '2026-10-01T09:05:00.000Z', '2026-10-02T08:00:00.000Z', '2026-09-01T00:00:00.000Z' ),
  ( '00000000-0000-4000-8000-000000000002', 'member@example.test', 'sub-member-2', 'Max Member', 'member', 'active', 'max-vault', NULL, NULL, '2026-10-02T08:30:00.000Z', '2026-09-02T00:00:00.000Z' );

INSERT INTO user_modules ( user_id, module ) VALUES
  ( '00000000-0000-4000-8000-000000000002', 'transcriber' ),
  ( '00000000-0000-4000-8000-000000000002', 'melete' );

INSERT INTO prompt_profiles ( id, user_id, name, seed_key, created_at, deleted_at, purpose, last_folder ) VALUES
  ( '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'General summary', 'general', '2026-09-01T00:00:00.000Z', NULL, 'summary', 'Inbox' ),
  ( '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Linker', 'linker', '2026-09-01T00:00:00.000Z', NULL, 'linker', NULL ),
  ( '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Questions', 'melete_questions', '2026-09-01T00:00:00.000Z', NULL, 'melete_questions', NULL ),
  ( '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Grading', 'melete_grading', '2026-09-01T00:00:00.000Z', NULL, 'melete_grading', NULL ),
  ( '10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'Study summary', 'study', '2026-09-02T00:00:00.000Z', NULL, 'summary', 'Study' ),
  ( '10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'Old profile', NULL, '2026-09-03T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 'summary', NULL );

INSERT INTO prompt_versions ( id, user_id, profile_id, version, guidance, source, created_at ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Focus on the main claims.', 'seed', '2026-09-01T00:00:00.000Z' ),
  ( 2, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 2, 'Focus on the main claims and examples.', 'edit', '2026-09-05T00:00:00.000Z' ),
  ( 3, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 1, 'Link to existing notes.', 'seed', '2026-09-01T00:00:00.000Z' ),
  ( 4, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 1, 'Ask recall questions.', 'seed', '2026-09-01T00:00:00.000Z' ),
  ( 5, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 1, 'Grade the answer kindly.', 'seed', '2026-09-01T00:00:00.000Z' ),
  ( 6, '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 1, 'Summarize for study.', 'seed', '2026-09-02T00:00:00.000Z' ),
  ( 7, '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 1, 'Retired guidance.', 'seed', '2026-09-03T00:00:00.000Z' );

INSERT INTO feeds ( id, user_id, url, feed_url, name, profile_id, enabled, auto_summarize, etag, last_modified, last_skipped_count, created_at, deleted_at ) VALUES
  ( '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'https://blog.example.test', 'https://blog.example.test/feed.xml', 'Example Blog', '10000000-0000-4000-8000-000000000001', 1, 0, 'etag-1', 'Mon, 05 Oct 2026 00:00:00 GMT', 0, '2026-09-10T00:00:00.000Z', NULL ),
  ( '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'https://news.example.test', 'https://news.example.test/atom', 'Example News', NULL, 1, 1, NULL, NULL, 2, '2026-09-11T00:00:00.000Z', NULL );

INSERT INTO jobs ( id, user_id, url, status, error, title, source_document, saved_path, expires_at, created_at, updated_at, note_markdown, target_folder, summary_model, prompt_profile_id, source_type, feed_id, gmail_source_id, link_state, link_error, duration_seconds ) VALUES
  ( '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'https://www.youtube.com/watch?v=aaaaaaaaaaa', 'queued', NULL, NULL, NULL, NULL, NULL, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z', NULL, NULL, NULL, NULL, 'video', NULL, NULL, NULL, NULL, NULL ),
  ( '30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'https://example.test/article-1', 'fetching', NULL, NULL, NULL, NULL, NULL, '2026-10-03T00:01:00.000Z', '2026-10-03T00:01:00.000Z', NULL, NULL, NULL, NULL, 'article', NULL, NULL, NULL, NULL, NULL ),
  ( '30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 'transcribing', NULL, 'A talk', NULL, NULL, NULL, '2026-10-03T00:02:00.000Z', '2026-10-03T00:02:30.000Z', NULL, NULL, NULL, NULL, 'video', NULL, NULL, NULL, NULL, 600 ),
  ( '30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'https://www.youtube.com/watch?v=ccccccccccc', 'summarizing', NULL, 'Another talk', '{"kind":"video","meta":{"title":"Another talk","source":"https://www.youtube.com/watch?v=ccccccccccc","channel":"Example Channel","duration_seconds":300,"transcribed_at":"2026-10-03T00:03:00.000Z","model":"gemini-test"},"text":"Invented transcript text."}', NULL, NULL, '2026-10-03T00:03:00.000Z', '2026-10-03T00:04:00.000Z', NULL, NULL, NULL, '10000000-0000-4000-8000-000000000001', 'video', NULL, NULL, NULL, NULL, 300 ),
  ( '30000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'https://example.test/article-2', 'linking', NULL, 'Article two', '{"kind":"article","meta":{"title":"Article two","source":"https://example.test/article-2","author":null,"site":"example.test","published":"2026-09-30","fetched_at":"2026-10-03T00:05:00.000Z","origin":"fetched"},"markdown":"Invented article text."}', NULL, NULL, '2026-10-03T00:05:00.000Z', '2026-10-03T00:06:00.000Z', '---\ntitle: Article two\n---\nInvented note.', NULL, 'claude-test', '10000000-0000-4000-8000-000000000001', 'article', NULL, NULL, 'pending', NULL, NULL ),
  ( '30000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'https://www.youtube.com/watch?v=ddddddddddd', 'ready_for_review', NULL, 'Reviewed talk', '{"kind":"video","meta":{"title":"Reviewed talk","source":"https://www.youtube.com/watch?v=ddddddddddd","channel":"Example Channel","duration_seconds":900,"transcribed_at":"2026-10-03T00:06:00.000Z","model":"gemini-test","truncated":true},"text":"Invented transcript text."}', NULL, '2026-10-04T00:10:00.000Z', '2026-10-03T00:06:00.000Z', '2026-10-03T00:10:00.000Z', '---\ntitle: Reviewed talk\n---\nInvented note with [[Existing note]].', 'Inbox', 'claude-test', '10000000-0000-4000-8000-000000000001', 'video', NULL, NULL, 'linked', NULL, 900 ),
  ( '30000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002', 'https://example.test/article-3', 'summary_failed', 'Summary failed: invented error', 'Article three', '{"kind":"article","meta":{"title":"Article three","source":"https://example.test/article-3","author":"Sam Writer","site":"example.test","published":null,"fetched_at":"2026-10-03T00:07:00.000Z","origin":"feed"},"markdown":"Invented article text."}', NULL, '2026-10-04T00:11:00.000Z', '2026-10-03T00:07:00.000Z', '2026-10-03T00:11:00.000Z', NULL, NULL, 'claude-test', '10000000-0000-4000-8000-000000000005', 'article', '20000000-0000-4000-8000-000000000002', NULL, NULL, NULL, NULL ),
  ( '30000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000001', 'https://example.test/article-4', 'saved', NULL, 'Saved article', NULL, 'Inbox/Saved article.md', NULL, '2026-10-02T00:00:00.000Z', '2026-10-02T01:00:00.000Z', NULL, 'Inbox', 'claude-test', '10000000-0000-4000-8000-000000000001', 'article', '20000000-0000-4000-8000-000000000001', NULL, 'linked', NULL, NULL ),
  ( '30000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002', 'https://www.youtube.com/watch?v=eeeeeeeeeee', 'failed', 'Only YouTube videos are supported', NULL, NULL, NULL, NULL, '2026-10-02T02:00:00.000Z', '2026-10-02T02:00:10.000Z', NULL, NULL, NULL, NULL, 'video', NULL, '40000000-0000-4000-8000-000000000001', 'failed', 'Agent unavailable', NULL );

INSERT INTO feed_items ( id, user_id, feed_id, item_key, title, link, published_at, author, content_markdown, status, job_id, added_at ) VALUES
  ( '21000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'post-1', 'First post', 'https://blog.example.test/1', '2026-10-01T00:00:00.000Z', 'Blog Author', 'Invented post text.', 'inbox', NULL, '2026-10-01T01:00:00.000Z' ),
  ( '21000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'post-2', 'Second post', 'https://blog.example.test/2', NULL, NULL, NULL, 'summarized', '30000000-0000-4000-8000-000000000008', '2026-10-01T02:00:00.000Z' ),
  ( '21000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'news-1', 'News item', 'https://news.example.test/1', '2026-10-02T00:00:00.000Z', NULL, NULL, 'dismissed', NULL, '2026-10-02T01:00:00.000Z' );

INSERT INTO summary_runs ( id, user_id, job_id, model, prompt_version_id, input_tokens, output_tokens, cost_usd, outcome, error, created_at ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'claude-test', 2, 12000, 800, 0.0521, 'succeeded', NULL, '2026-10-03T00:09:00.000Z' ),
  ( 2, '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'claude-test', 6, 5000, 0, 0.0150, 'failed', 'invented error', '2026-10-03T00:10:00.000Z' );

INSERT INTO transcription_runs ( id, user_id, job_id, model, audio_seconds, pieces, cost_usd, outcome, error, created_at, input_tokens, output_tokens ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'gemini-test', 900, 1, 0.0210, 'ok', NULL, '2026-10-03T00:06:00.000Z', 24000, 9000 ),
  ( 2, '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'gemini-test', 0, 1, NULL, 'error', 'invented error', '2026-10-02T02:00:05.000Z', NULL, NULL );

INSERT INTO link_runs ( id, user_id, job_id, model, prompt_version_id, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, tool_calls, cost_usd, outcome, error, created_at ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'claude-test', 3, 8000, 300, 1000, 500, 4, 0.0310, 'succeeded', NULL, '2026-10-03T00:09:30.000Z' ),
  ( 2, '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'claude-test', 3, NULL, NULL, NULL, NULL, NULL, NULL, 'failed', 'Agent unavailable', '2026-10-02T02:00:09.000Z' );

INSERT INTO link_suggestions ( id, user_id, job_id, run_id, position, target, kind, anchor, reason, status, decided_at ) VALUES
  ( '31000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 1, 0, 'Existing note', 'existing_note', 'Invented note', 'Related topic', 'accepted', '2026-10-03T00:11:00.000Z' ),
  ( '31000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 1, 1, 'New idea', 'new_concept', NULL, 'Worth its own note', 'pending', NULL );

INSERT INTO gmail_account ( user_id, email, refresh_token_enc, scope, status, error, connected_at ) VALUES
  ( '00000000-0000-4000-8000-000000000001', 'mailbox@example.test', 'not-a-real-token', 'https://www.googleapis.com/auth/gmail.readonly', 'connected', NULL, '2026-09-20T00:00:00.000Z' );

INSERT INTO gmail_sources ( id, user_id, name, match_kind, label_ids, query, destination, profile_id, enabled, auto_summarize, sync_from, last_skipped_count, created_at, deleted_at ) VALUES
  ( '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Newsletter', 'label', '["Label_1"]', NULL, 'newsletter', '10000000-0000-4000-8000-000000000001', 1, 0, '2026-09-20T00:00:00.000Z', 0, '2026-09-20T00:00:00.000Z', NULL ),
  ( '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Job alerts', 'query', NULL, 'from:alerts@example.test', 'jobs', NULL, 0, 0, '2026-09-21T00:00:00.000Z', 1, '2026-09-21T00:00:00.000Z', NULL );

INSERT INTO gmail_messages ( id, user_id, source_id, message_id, subject, sender, sender_address, received_at, body_html, body_text, status, backfilled, attempts, error, job_id, added_at ) VALUES
  ( '41000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'msg-1', 'This week', 'Example Letter', 'letter@example.test', '2026-10-01T06:00:00.000Z', '<p>Invented body</p>', 'Invented body', 'inbox', 0, 0, NULL, NULL, '2026-10-01T06:01:00.000Z' ),
  ( '41000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'msg-2', 'New jobs for you', 'Alerts', 'alerts@example.test', '2026-10-02T06:00:00.000Z', '<p>Invented alert</p>', NULL, 'extracted', 1, 1, NULL, NULL, '2026-10-02T06:01:00.000Z' );

INSERT INTO extraction_runs ( id, user_id, gmail_message_row, model, input_tokens, output_tokens, cost_usd, outcome, postings_count, error, created_at ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'claude-test', 2000, 400, 0.0090, 'succeeded', 1, NULL, '2026-10-02T06:02:00.000Z' );

INSERT INTO job_postings ( id, user_id, platform, platform_job_id, dedupe_key, title, url, posted_at, first_seen_at, last_seen_at, details ) VALUES
  ( '42000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'examplehub', 'job-123', 'examplehub:job-123', 'Invented posting', 'https://jobs.example.test/123', '2026-10-02T00:00:00.000Z', '2026-10-02T06:02:00.000Z', '2026-10-02T06:02:00.000Z', '{"budget":null}' );

INSERT INTO posting_sightings ( user_id, posting_id, gmail_message_row, seen_at ) VALUES
  ( '00000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', '2026-10-02T06:02:00.000Z' );

INSERT INTO melete_subjects ( id, user_id, folder, auto_enroll, new_per_day, created_at ) VALUES
  ( '50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Learning/Biology', 1, 5, '2026-09-15T00:00:00.000Z' );

INSERT INTO melete_notes ( id, user_id, subject_id, path, title, body_hash, mtime_ms, size, enrolled, enrolled_at, generation, generation_error, missing_at, created_at ) VALUES
  ( '51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Learning/Biology/Cells.md', 'Cells', 'hash-cells-1', 1790000000000, 1200, 1, '2026-09-16T00:00:00.000Z', 'idle', NULL, NULL, '2026-09-15T00:00:00.000Z' ),
  ( '51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Learning/Biology/Old.md', 'Old', 'hash-old-1', 1790000001000, 300, 0, NULL, 'failed', 'invented error', '2026-10-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z' );

INSERT INTO melete_runs ( id, user_id, kind, note_id, question_id, model, prompt_version_id, input_tokens, output_tokens, cost_usd, outcome, error, created_at ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000002', 'generate', '51000000-0000-4000-8000-000000000001', NULL, 'claude-test', 4, 3000, 700, 0.0200, 'succeeded', NULL, '2026-09-16T00:01:00.000Z' ),
  ( 2, '00000000-0000-4000-8000-000000000002', 'grade', NULL, '52000000-0000-4000-8000-000000000001', 'claude-test', 5, 900, 120, 0.0040, 'succeeded', NULL, '2026-09-20T09:00:00.000Z' );

INSERT INTO melete_questions ( id, user_id, note_id, position, prompt, answer, passage, body_hash, state, run_id, due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, fsrs_state, last_review, created_at ) VALUES
  ( '52000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 0, 'What does the nucleus hold?', 'DNA.', 'The nucleus holds the DNA.', 'hash-cells-1', 'active', 1, '2026-09-27T09:00:00.000Z', 4.5, 5.2, 7, 0, 2, 0, 'review', '2026-09-20T09:00:00.000Z', '2026-09-16T00:01:00.000Z' ),
  ( '52000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 1, 'What makes ATP?', 'Mitochondria.', 'Mitochondria make ATP.', 'hash-cells-1', 'active', 1, NULL, 0, 0, 0, 0, 0, 0, 'new', NULL, '2026-09-16T00:01:00.000Z' );

INSERT INTO melete_reviews ( id, user_id, question_id, reviewed_at, mode, rating, suggested_rating, answer, grade_run_id, was_new, before_state ) VALUES
  ( 1, '00000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '2026-09-20T09:00:00.000Z', 'typed', 'good', 'good', 'DNA', 2, 0, '{"fsrs_state":"review","reps":1}' );

INSERT INTO sessions ( token_hash, user_id, created_at, last_seen_at, expires_at ) VALUES
  ( 'hash-session-admin', '00000000-0000-4000-8000-000000000001', '2026-10-02T08:00:00.000Z', '2026-10-03T08:00:00.000Z', '2026-11-02T08:00:00.000Z' ),
  ( 'hash-session-member', '00000000-0000-4000-8000-000000000002', '2026-10-02T08:30:00.000Z', '2026-10-03T08:30:00.000Z', '2026-11-02T08:30:00.000Z' );

INSERT INTO settings ( user_id, key, value ) VALUES
  ( '00000000-0000-4000-8000-000000000001', 'default_model', 'claude-test' ),
  ( '00000000-0000-4000-8000-000000000001', 'linking_enabled', 'true' ),
  ( '00000000-0000-4000-8000-000000000002', 'melete_learning_root', 'Learning' );

INSERT INTO app_settings ( key, value ) VALUES
  ( 'feed_check_interval_minutes', '30' );

INSERT INTO health_status ( user_id, kind, subject_id, last_checked_at, last_success_at, last_error, failing_since, detail ) VALUES
  ( '00000000-0000-4000-8000-000000000001', 'feed', '20000000-0000-4000-8000-000000000001', '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z', NULL, NULL, NULL ),
  ( '00000000-0000-4000-8000-000000000001', 'gmail_connection', '00000000-0000-4000-8000-000000000001', '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z', NULL, NULL, NULL ),
  ( NULL, 'agent', 'default', '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z', NULL, NULL, NULL ),
  ( NULL, 'transcription', 'default', '2026-10-03T10:00:00.000Z', '2026-10-03T09:58:00.000Z', 'invented error', '2026-10-03T09:59:00.000Z', NULL ),
  ( NULL, 'replication', 'default', '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z', NULL, NULL, '{"last_sync_at":"2026-10-03T10:00:00.000Z"}' );

INSERT INTO health_errors ( id, user_id, kind, subject_id, at, message ) VALUES
  ( 1, NULL, 'transcription', 'default', '2026-10-03T09:59:00.000Z', 'invented error' ),
  ( 2, '00000000-0000-4000-8000-000000000001', 'feed', '20000000-0000-4000-8000-000000000001', '2026-10-02T10:00:00.000Z', 'invented feed error' );
