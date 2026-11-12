// Packages
import { z } from 'zod'
// Local
import { CalendarDate } from './themis.js'

// Time entries (ADRs 0091, 0108): measured sessions are made by the server from saved answers;
// logged entries are the person's own minutes against a subject or a goal; calendar entries are
// approved calendar events.

export const TimeSource = z.enum( [ 'measured', 'logged', 'calendar' ] )
export type TimeSource = z.infer< typeof TimeSource >

export const TimeEntry = z.object( {
  id: z.uuid(),
  source: TimeSource,
  subject_id: z.uuid().nullable(),
  goal_id: z.uuid().nullable(),
  day: z.string(),
  seconds: z.int().min( 1 ),
  note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )
export type TimeEntry = z.infer< typeof TimeEntry >

const Minutes = z.int().min( 1 ).max( 1440 )
const Note = z.string().trim().min( 1 ).max( 500 )

export const LogTimeBody = z.strictObject( {
  subject_id: z.uuid().optional(),
  goal_id: z.uuid().optional(),
  day: CalendarDate,
  minutes: Minutes,
  note: Note.optional(),
} ).refine(
  ( body ) => ( body.subject_id === undefined ) !== ( body.goal_id === undefined ),
  { message: 'Give a subject_id or a goal_id, not both' },
)
export type LogTimeBody = z.infer< typeof LogTimeBody >

// The target can't change: log it again against the right one
export const UpdateTimeEntryBody = z.strictObject( {
  minutes: Minutes.optional(),
  day: CalendarDate.optional(),
  note: Note.nullable().optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide minutes, day or note' },
)
export type UpdateTimeEntryBody = z.infer< typeof UpdateTimeEntryBody >

// What /api/time-entries/:id accepts: a logged entry's target can't change, a calendar entry's
// can (ADR 0108), and the service refuses a target for a logged one.
export const EditTimeEntryBody = z.strictObject( {
  minutes: Minutes.optional(),
  day: CalendarDate.optional(),
  note: Note.nullable().optional(),
  subject_id: z.uuid().optional(),
  goal_id: z.uuid().optional(),
} ).refine(
  ( body ) => body.subject_id === undefined || body.goal_id === undefined,
  { message: 'Give a subject_id or a goal_id, not both' },
).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide minutes, day, note or a target' },
)
export type EditTimeEntryBody = z.infer< typeof EditTimeEntryBody >

export const ListTimeEntriesQuery = z.strictObject( {
  from: CalendarDate,
  to: CalendarDate,
} ).refine( ( query ) => query.from <= query.to, { message: 'from is after to' } )
export type ListTimeEntriesQuery = z.infer< typeof ListTimeEntriesQuery >

export const TimeEntryResponse = z.object( { entry: TimeEntry } )
export type TimeEntryResponse = z.infer< typeof TimeEntryResponse >

export const ListTimeEntriesResponse = z.object( { entries: z.array( TimeEntry ) } )
export type ListTimeEntriesResponse = z.infer< typeof ListTimeEntriesResponse >
