
ALTER TABLE transcription_runs DROP COLUMN pieces;
ALTER TABLE transcription_runs RENAME COLUMN audio_seconds TO duration_seconds;