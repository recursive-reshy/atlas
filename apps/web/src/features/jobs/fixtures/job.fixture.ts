// Shared
import type { Job } from '@atlas/shared'

export const jobFixture = ( overrides: Partial< Job > = {} ): Job => {
  return {
    id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    url: 'https://www.youtube.com/watch?v=cFoaK1OQRhw',
    status: 'queued',
    error: null,
    created_at: '2026-10-15T10:00:00.000Z',
    updated_at: '2026-10-15T10:00:00.000Z',
    title: null,
    note_markdown: null,
    target_folder: null,
    default_folder: 'Mnemosyne',
    expires_at: null,
    saved_path: null,
    summary_model: null,
    prompt_profile_id: null,
    summary_usage: null,
    link_state: null,
    link_error: null,
    link_usage: null,
    source_type: 'video',
    feed_id: null,
    feed_name: null,
    gmail_source_id: null,
    gmail_source_name: null,
    ...overrides,
  }
}
