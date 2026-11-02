// Shared
import type {
  GmailAccount,
  GmailLabel,
  GmailSource,
  InboxItem,
  PreviewGmailSourceResponse,
} from '@atlas/shared'

export const gmailAccountFixture = ( overrides: Partial< GmailAccount > = {} ): GmailAccount => {
  return {
    status: 'connected',
    email: 'naresh@example.com',
    connected_at: '2026-10-19T10:00:00.000Z',
    error: null,
    ...overrides,
  }
}

export const gmailLabelFixture = ( overrides: Partial< GmailLabel > = {} ): GmailLabel => {
  return {
    id: 'Label_1',
    name: 'Newsletters',
    type: 'user',
    ...overrides,
  }
}

export const SOURCE_ID = '3b9d7c1e-2f4a-4b6c-8d0e-1a2b3c4d5e6f'

export const gmailSourceFixture = ( overrides: Partial< GmailSource > = {} ): GmailSource => {
  return {
    id: SOURCE_ID,
    name: 'Newsletters',
    match: { kind: 'labels', label_ids: [ 'Label_1' ] },
    label_names: [ 'Newsletters' ],
    destination: 'newsletter',
    profile_id: null,
    auto_summarize: false,
    enabled: true,
    sync_from: '2026-10-19T10:00:00.000Z',
    last_checked_at: '2026-10-20T09:00:00.000Z',
    last_error: null,
    last_skipped_count: 0,
    inbox_count: 0,
    postings_count: 0,
    created_at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  }
}

export const gmailPreviewFixture = (
  overrides: Partial< PreviewGmailSourceResponse > = {},
): PreviewGmailSourceResponse => {
  return {
    count: 12,
    count_capped: false,
    newest: {
      subject: 'This week in tech',
      from: 'Lenny',
      received_at: '2026-10-19T08:00:00.000Z',
    },
    overlaps: [],
    ...overrides,
  }
}

export const GMAIL_ITEM_ID = '8e7d6c5b-4a39-4281-9a0b-1c2d3e4f5a6b'

export const gmailItemFixture = (
  overrides: Partial< Extract< InboxItem, { kind: 'gmail' } > > = {},
): Extract< InboxItem, { kind: 'gmail' } > => {
  return {
    kind: 'gmail',
    id: GMAIL_ITEM_ID,
    source_id: SOURCE_ID,
    source_name: 'Newsletters',
    title: 'This week in tech',
    sender: 'Lenny',
    link: 'https://mail.google.com/mail/u/naresh%40example.com/#all/19a1b2c3d4e5f607',
    published_at: '2026-10-19T08:00:00.000Z',
    source_type: 'article',
    added_at: '2026-10-19T09:00:00.000Z',
    ...overrides,
  }
}
