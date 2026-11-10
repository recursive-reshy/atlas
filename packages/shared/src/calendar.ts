// Packages
import { z } from 'zod'
// Local
import { CalendarConnectionStatus } from './calendarStatus.js'
import { CalendarDate } from './themis.js'

export { CalendarConnectionStatus } from './calendarStatus.js'

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

// Title rules (ADR 0108): a phrase contained in an event's title, case-insensitively, assigns
// the event to a subject or a goal; the first rule by position wins.
export const CalendarRule = z.object( {
  id: z.uuid(),
  phrase: z.string(),
  subject_id: z.uuid().nullable(),
  goal_id: z.uuid().nullable(),
  position: z.int().min( 0 ),
} )
export type CalendarRule = z.infer< typeof CalendarRule >

export const ListCalendarRulesResponse = z.object( { rules: z.array( CalendarRule ) } )
export type ListCalendarRulesResponse = z.infer< typeof ListCalendarRulesResponse >

export const CalendarRuleResponse = z.object( { rule: CalendarRule } )
export type CalendarRuleResponse = z.infer< typeof CalendarRuleResponse >

const Phrase = z.string().trim().min( 1 ).max( 100 )

export const CreateCalendarRuleBody = z.strictObject( {
  phrase: Phrase,
  subject_id: z.uuid().optional(),
  goal_id: z.uuid().optional(),
} ).refine(
  ( body ) => ( body.subject_id === undefined ) !== ( body.goal_id === undefined ),
  { message: 'Give a subject_id or a goal_id, not both' },
)
export type CreateCalendarRuleBody = z.infer< typeof CreateCalendarRuleBody >

export const UpdateCalendarRuleBody = z.strictObject( {
  phrase: Phrase.optional(),
  subject_id: z.uuid().optional(),
  goal_id: z.uuid().optional(),
  position: z.int().min( 0 ).optional(),
} ).refine(
  ( body ) => body.subject_id === undefined || body.goal_id === undefined,
  { message: 'Give a subject_id or a goal_id, not both' },
).refine(
  ( body ) => Object.keys( body ).length > 0,
  { message: 'Change at least one field' },
)
export type UpdateCalendarRuleBody = z.infer< typeof UpdateCalendarRuleBody >

// `skipped` is true when the last sync was newer than `if_older_than` and nothing was read
export const SyncCalendarResponse = z.object( {
  added: z.int().min( 0 ),
  updated: z.int().min( 0 ),
  removed: z.int().min( 0 ),
  drafts: z.int().min( 0 ),
  skipped: z.boolean(),
} )
export type SyncCalendarResponse = z.infer< typeof SyncCalendarResponse >

export const SyncCalendarQuery = z.object( {
  if_older_than: z.coerce.number().int().min( 0 ).max( 86_400 ).optional(),
} )
export type SyncCalendarQuery = z.infer< typeof SyncCalendarQuery >

// A calendar event waiting for review (ADR 0108). `overlap_seconds` is what measured Melete time
// already covers; `counts_seconds` is what approval would record.
export const CalendarDraft = z.object( {
  id: z.uuid(),
  title: z.string(),
  started_at: z.iso.datetime(),
  ended_at: z.iso.datetime(),
  day: CalendarDate,
  seconds: z.int().min( 1 ),
  subject_id: z.uuid().nullable(),
  goal_id: z.uuid().nullable(),
  assigned_by: z.enum( [ 'rule', 'hand' ] ).nullable(),
  rule_phrase: z.string().nullable(),
  note: z.string().nullable(),
  overlap_seconds: z.int().min( 0 ),
  counts_seconds: z.int().min( 0 ),
} )
export type CalendarDraft = z.infer< typeof CalendarDraft >

export const ListCalendarDraftsResponse = z.object( { drafts: z.array( CalendarDraft ) } )
export type ListCalendarDraftsResponse = z.infer< typeof ListCalendarDraftsResponse >

export const CalendarDraftResponse = z.object( { draft: CalendarDraft } )
export type CalendarDraftResponse = z.infer< typeof CalendarDraftResponse >

export const UpdateCalendarDraftBody = z.strictObject( {
  subject_id: z.uuid().optional(),
  goal_id: z.uuid().optional(),
  started_at: z.iso.datetime().optional(),
  ended_at: z.iso.datetime().optional(),
  note: z.string().trim().min( 1 ).max( 500 ).nullable().optional(),
} ).refine(
  ( body ) => body.subject_id === undefined || body.goal_id === undefined,
  { message: 'Give a subject_id or a goal_id, not both' },
).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Change at least one field' },
)
export type UpdateCalendarDraftBody = z.infer< typeof UpdateCalendarDraftBody >

// `time_entry_id` is null when measured time already covered the whole event
export const ApproveCalendarDraftResponse = z.object( {
  time_entry_id: z.uuid().nullable(),
  recorded_seconds: z.int().min( 0 ),
} )
export type ApproveCalendarDraftResponse = z.infer< typeof ApproveCalendarDraftResponse >

export const ApproveMatchedResponse = z.object( { approved: z.int().min( 0 ) } )
export type ApproveMatchedResponse = z.infer< typeof ApproveMatchedResponse >
