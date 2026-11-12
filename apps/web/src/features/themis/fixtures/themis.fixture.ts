// Shared
import type {
  GetThemisOverviewResponse,
  ThemisCheckinDue,
  ThemisGoalCard,
  ThemisOverviewArea,
  ThemisTime,
} from '@atlas/shared'

export const CAREER_ID = '7a000000-0000-4000-8000-000000000001'
export const FINANCE_ID = '7a000000-0000-4000-8000-000000000002'
export const LEARN_GOAL_ID = '7b000000-0000-4000-8000-000000000001'
export const METRIC_GOAL_ID = '7b000000-0000-4000-8000-000000000002'
export const CHECKIN_GOAL_ID = '7b000000-0000-4000-8000-000000000003'
export const SUBJECT_ID = '7c000000-0000-4000-8000-000000000001'

const CREATED = '2026-10-01T08:00:00.000Z'

export const timeFixture = ( measured = 0, logged = 0, calendar = 0 ): ThemisTime => ( {
  seconds: measured + logged + calendar,
  measured,
  logged,
  calendar,
} )

const base = {
  position: 0,
  target_date: null,
  status: 'active',
  status_changed_at: null,
  created_at: CREATED,
} as const

export const learningCardFixture = (): ThemisGoalCard => ( {
  goal: {
    ...base,
    id: LEARN_GOAL_ID,
    area_id: CAREER_ID,
    name: 'Move into data engineering',
    outcome: 'learning',
    target_date: '2027-03-01',
  },
  time: timeFixture( 5400, 1800 ),
  outcome: { type: 'learning', coverage: 0.5, mastery: 0.25, concept_count: 20 },
  subjects: [ { id: SUBJECT_ID, name: 'Data Engineering' } ],
} )

export const metricCardFixture = (): ThemisGoalCard => ( {
  goal: {
    ...base,
    id: METRIC_GOAL_ID,
    area_id: FINANCE_ID,
    name: 'Emergency fund',
    outcome: 'metric',
    metric_unit: 'k',
    metric_target: 30,
  },
  time: timeFixture(),
  outcome: {
    type: 'metric',
    unit: 'k',
    target: 30,
    latest: 12,
    updates: [
      { id: 3, value: 12, note: null, at: '2026-11-03T08:00:00.000Z' },
      { id: 2, value: 9, note: null, at: '2026-10-20T08:00:00.000Z' },
      { id: 1, value: 5, note: null, at: '2026-10-06T08:00:00.000Z' },
    ],
  },
  subjects: [],
} )

export const checkinCardFixture = (): ThemisGoalCard => ( {
  goal: {
    ...base,
    id: CHECKIN_GOAL_ID,
    area_id: FINANCE_ID,
    name: 'Time with family',
    outcome: 'checkin',
    checkin_cadence: 'weekly',
  },
  time: timeFixture(),
  outcome: {
    type: 'checkin',
    cadence: 'weekly',
    ratings: [
      { id: 2, period_start: '2026-10-26', rating: 4, note: null, created_at: CREATED },
      { id: 1, period_start: '2026-10-19', rating: 2, note: null, created_at: CREATED },
    ],
  },
  subjects: [],
} )

export const overviewFixture = (
  overrides: Partial< GetThemisOverviewResponse > = {},
): GetThemisOverviewResponse => {
  const areas: ThemisOverviewArea[] = [
    {
      id: CAREER_ID,
      name: 'Career',
      position: 0,
      time: timeFixture( 5400, 1800 ),
      goals: [ learningCardFixture() ],
    },
    {
      id: FINANCE_ID,
      name: 'Financial',
      position: 1,
      time: timeFixture(),
      goals: [ metricCardFixture(), checkinCardFixture() ],
    },
  ]

  return {
    period: 'week',
    from: '2026-11-02',
    to: '2026-11-08',
    calendar_drafts: 0,
    calendar_status: 'not_configured',
    checkins_due: [],
    areas,
    ...overrides,
  }
}

export const dueFixture = (): ThemisCheckinDue => ( {
  goal_id: CHECKIN_GOAL_ID,
  goal_name: 'Time with family',
  area_id: FINANCE_ID,
  area_name: 'Financial',
  cadence: 'weekly',
  period_start: '2026-10-26',
  period_end: '2026-11-01',
} )
