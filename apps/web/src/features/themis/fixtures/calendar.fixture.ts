// Shared
import type { CalendarChoice, GetCalendarResponse } from '@atlas/shared'

export const calendarFixture = (
  overrides: Partial< GetCalendarResponse > = {},
): GetCalendarResponse => ( {
  status: 'connected',
  email: 'naresh@example.com',
  calendar: { id: 'naresh@example.com', name: 'Naresh' },
  import_from: '2026-11-01',
  last_synced_at: '2026-11-10T08:00:00.000Z',
  ...overrides,
} )

export const calendarChoicesFixture = (): CalendarChoice[] => [
  { id: 'naresh@example.com', name: 'Naresh', primary: true },
  { id: 'work@example.com', name: 'Work', primary: false },
]
