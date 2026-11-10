// Shared
import type { GetThemisGoalResponse, GetThemisGoalsResponse } from '@atlas/shared'
// App
import {
  checkinCardFixture,
  learningCardFixture,
  metricCardFixture,
} from './themis.fixture'

export const DROPPED_GOAL_ID = '7b000000-0000-4000-8000-000000000009'

export const goalDetailFixture = (
  overrides: Partial< GetThemisGoalResponse > = {},
): GetThemisGoalResponse => {
  const { goal, outcome, subjects } = metricCardFixture()

  return {
    goal,
    outcome,
    subjects,
    metric_updates: [
      { id: 3, value: 12, note: 'Bonus', at: '2026-11-03T08:00:00.000Z' },
      { id: 2, value: 9, note: null, at: '2026-10-20T08:00:00.000Z' },
    ],
    checkins: [],
    time_by_week: [
      { week_start: '2026-10-26', measured: 0, logged: 1800, calendar: 0 },
      { week_start: '2026-11-02', measured: 3600, logged: 0, calendar: 0 },
    ],
    ...overrides,
  }
}

export const goalsListFixture = (): GetThemisGoalsResponse => ( {
  goals: [
    { goal: learningCardFixture().goal, area_name: 'Career' },
    { goal: metricCardFixture().goal, area_name: 'Financial' },
    {
      goal: { ...checkinCardFixture().goal, status: 'achieved' },
      area_name: 'Financial',
    },
    {
      goal: {
        ...learningCardFixture().goal,
        id: DROPPED_GOAL_ID,
        name: 'Old plan',
        status: 'dropped',
      },
      area_name: 'Career',
    },
  ],
} )
