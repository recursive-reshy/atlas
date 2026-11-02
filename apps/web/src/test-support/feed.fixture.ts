// Shared
import type { Feed, InboxItem } from '@atlas/shared'

type FeedInboxItem = Extract< InboxItem, { kind: 'feed' } >

export const FEED_ID = '7d1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b'
export const ITEM_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

export const feedFixture = ( overrides: Partial< Feed > = {} ): Feed => {
  return {
    id: FEED_ID,
    url: 'https://blog.example.com',
    feed_url: 'https://blog.example.com/feed.xml',
    name: 'Example Blog',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    last_checked_at: '2026-10-18T09:00:00.000Z',
    last_error: null,
    last_skipped_count: 0,
    inbox_count: 0,
    created_at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

export const feedItemFixture = ( overrides: Partial< FeedInboxItem > = {} ): FeedInboxItem => {
  return {
    kind: 'feed',
    id: ITEM_ID,
    feed_id: FEED_ID,
    feed_name: 'Example Blog',
    title: 'A new post',
    link: 'https://blog.example.com/a-new-post',
    published_at: '2026-10-17T08:00:00.000Z',
    source_type: 'article',
    added_at: '2026-10-18T09:00:00.000Z',
    ...overrides,
  }
}
