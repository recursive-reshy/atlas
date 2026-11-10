// Packages
import { z } from 'zod'
// Local
import { CalendarDate } from './themis.js'

// Google Calendar as a reviewed time source (ADR 0108). `broken` is a connection Google no longer
// accepts or whose token can't be read; imported time is kept.
export const CalendarConnectionStatus = z.enum( [
  'not_configured',
  'not_connected',
  'connected',
  'broken',
] )
export type CalendarConnectionStatus = z.infer< typeof CalendarConnectionStatus >

export const GetCalendarResponse = z.object( {
  status: CalendarConnectionStatus,
  email: z.string().optional(),
  calendar: z.object( { id: z.string(), name: z.string() } ).optional(),
  import_from: CalendarDate.optional(),
  last_synced_at: z.iso.datetime().optional(),
  error: z.string().optional(),
} )
export type GetCalendarResponse = z.infer< typeof GetCalendarResponse >

export const ConnectCalendarResponse = z.object( { url: z.url() } )
export type ConnectCalendarResponse = z.infer< typeof ConnectCalendarResponse >

export const CalendarChoice = z.object( {
  id: z.string(),
  name: z.string(),
  primary: z.boolean(),
} )
export type CalendarChoice = z.infer< typeof CalendarChoice >

export const ListCalendarsResponse = z.object( { calendars: z.array( CalendarChoice ) } )
export type ListCalendarsResponse = z.infer< typeof ListCalendarsResponse >

// The server also refuses a day in the future or more than 365 days back
export const SelectCalendarBody = z.strictObject( {
  calendar_id: z.string().min( 1 ).max( 500 ),
  import_from: CalendarDate,
} )
export type SelectCalendarBody = z.infer< typeof SelectCalendarBody >
