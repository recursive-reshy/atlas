// Shared
import { VideoSource } from '@atlas/shared'

export const transcriptFixture: Pick< VideoSource, 'meta' | 'text' > = {
  meta: {
    title: 'Video title',
    source: 'https://www.youtube.com/watch?v=abc123',
    channel: 'Channel name',
    duration_seconds: 2472,
    transcribed_at: '2026-10-14T23:30:00.000Z',
    model: 'large-v3-turbo',
  },
  text: [
    'Welcome to the talk. Today we cover formatters. They are pure functions.',
    'No I/O is involved.',
    'Last, the Markdown output.',
  ].join( '\n\n' ),
}
