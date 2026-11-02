// Shared
import { Transcript } from '@atlas/shared'

export const transcriptFixture: Transcript = {
  meta: {
    title: 'Video title',
    source: 'https://www.youtube.com/watch?v=abc123',
    channel: 'Channel name',
    duration_seconds: 2472,
    transcribed_at: '2026-10-14T23:30:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [
    { start: 0, end: 4.2, text: 'Welcome to the talk.' },
    { start: 4.2, end: 9, text: '  Today we cover   formatters. ' },
    { start: 9, end: 12, text: '   ' },
    { start: 9, end: 20.5, text: 'They are pure functions.' },
    { start: 22.5, end: 30, text: 'No I/O is involved.' },
    { start: 135, end: 140.25, text: 'Last, the Markdown output.' },
  ],
}
