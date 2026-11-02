// Shared
import type { StoredLinkSuggestion } from '@atlas/shared'

export const SUGGESTION_ID = '5a1e0b7c-2d4f-4a6e-8b9c-0d1e2f3a4b01'

export const linkSuggestionFixture = (
  overrides: Partial< StoredLinkSuggestion > = {},
): StoredLinkSuggestion => {
  return {
    id: SUGGESTION_ID,
    job_id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    position: 0,
    target: 'Pricing Strategy',
    kind: 'existing_note',
    anchor: 'pricing strategy',
    reason: 'The note is about how to price a product.',
    status: 'pending',
    decided_at: null,
    ...overrides,
  }
}
