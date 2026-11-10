// Shared
import type { CalendarDraft, CalendarRule } from '@atlas/shared'
// App
import { LEARN_GOAL_ID } from './themis.fixture'

export const DRAFT_ID = '7d000000-0000-4000-8000-000000000001'
export const RULE_ID = '7e000000-0000-4000-8000-000000000001'

// 09:00 to 10:00 local on 2026-11-09, so the time range reads the same in any time zone
export const draftFixture = ( overrides: Partial< CalendarDraft > = {} ): CalendarDraft => ( {
  id: DRAFT_ID,
  title: 'Data engineering study block',
  started_at: new Date( 2026, 10, 9, 9, 0 ).toISOString(),
  ended_at: new Date( 2026, 10, 9, 10, 0 ).toISOString(),
  day: '2026-11-09',
  seconds: 3600,
  subject_id: null,
  goal_id: null,
  assigned_by: null,
  rule_phrase: null,
  note: null,
  overlap_seconds: 0,
  counts_seconds: 3600,
  ...overrides,
} )

export const ruleFixture = ( overrides: Partial< CalendarRule > = {} ): CalendarRule => ( {
  id: RULE_ID,
  phrase: 'study block',
  subject_id: null,
  goal_id: LEARN_GOAL_ID,
  position: 0,
  ...overrides,
} )
