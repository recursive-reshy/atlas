// Packages
import { z } from 'zod'

// Google Calendar's connection, for the Settings section and the Themis overview (ADR 0108).
// `broken` is a connection Google no longer accepts or whose token can't be read; imported time
// is kept. It lives apart from calendar.ts, which imports themis.ts.
export const CalendarConnectionStatus = z.enum( [
  'not_configured',
  'not_connected',
  'connected',
  'broken',
] )
export type CalendarConnectionStatus = z.infer< typeof CalendarConnectionStatus >
