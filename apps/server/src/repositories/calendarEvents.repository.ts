// Repositories
import { getDatabase } from './database.js'
import type { ExistingEvent, RuleAssignment } from '../calendar/reconcile.js'

export type CalendarEventStatus = 'draft' | 'approved' | 'dismissed'

// Switching calendars drops the old calendar's drafts; approved and dismissed events stay as
// markers, so a later sync never imports them again
export const deleteDrafts = ( userId: string, calendarId: string ): void => {
  getDatabase().prepare( `DELETE FROM calendar_events
    WHERE user_id = ? AND calendar_id = ? AND status = 'draft'` ).run( userId, calendarId )
}

// "Remove imported time": the calendar's events and the time entries they recorded
export const removeImported = ( userId: string, calendarId: string ): void => {
  const db = getDatabase()

  db.transaction( () => {
    db.prepare( `DELETE FROM time_entries WHERE user_id = ? AND id IN (
      SELECT time_entry_id FROM calendar_events
      WHERE user_id = ? AND calendar_id = ? AND time_entry_id IS NOT NULL )` )
      .run( userId, userId, calendarId )
    db.prepare( 'DELETE FROM calendar_events WHERE user_id = ? AND calendar_id = ?' )
      .run( userId, calendarId )
  } )()
}

export const countEvents = ( userId: string, status: CalendarEventStatus ): number => {
  const row = getDatabase()
    .prepare( 'SELECT COUNT(*) AS count FROM calendar_events WHERE user_id = ? AND status = ?' )
    .get( userId, status ) as { count: number }

  return row.count
}

export type RuleAssignable = { id: string, title: string }

// Drafts a title rule may set: nothing assigned yet, or assigned by a rule. A hand assignment
// stays (ADR 0108).
export const listRuleAssignable = ( userId: string ): RuleAssignable[] => {
  return getDatabase().prepare( `SELECT id, title FROM calendar_events
    WHERE user_id = ? AND status = 'draft' AND ( assigned_by IS NULL OR assigned_by = 'rule' )
    ORDER BY started_at, id` ).all( userId ) as RuleAssignable[]
}

// A match assigns by rule; null clears what a rule had assigned
export const setRuleAssignment = (
  userId: string,
  id: string,
  assignment: RuleAssignment | null,
): void => {
  getDatabase().prepare( `UPDATE calendar_events SET
      subject_id = @subject_id, goal_id = @goal_id, rule_id = @rule_id,
      assigned_by = @assigned_by, updated_at = @now
    WHERE id = @id AND user_id = @user_id` ).run( {
    subject_id: assignment?.subject_id ?? null,
    goal_id: assignment?.goal_id ?? null,
    rule_id: assignment?.rule_id ?? null,
    assigned_by: assignment === null ? null : 'rule',
    now: new Date().toISOString(),
    id,
    user_id: userId,
  } )
}

export type NewDraft = {
  event_id: string
  title: string
  started_at: string
  ended_at: string
  day: string
  seconds: number
  assignment: RuleAssignment | null
}

export const listEventsForSync = ( userId: string, calendarId: string ): ExistingEvent[] => {
  return getDatabase().prepare( `SELECT id, event_id, status, title, started_at, ended_at,
      assigned_by FROM calendar_events WHERE user_id = ? AND calendar_id = ?` )
    .all( userId, calendarId ) as ExistingEvent[]
}

export const insertDraft = ( userId: string, calendarId: string, draft: NewDraft ): void => {
  const now = new Date().toISOString()

  getDatabase().prepare( `INSERT INTO calendar_events (
      id, user_id, calendar_id, event_id, title, started_at, ended_at, day, seconds, status,
      subject_id, goal_id, assigned_by, rule_id, created_at, updated_at
    ) VALUES (
      @id, @user_id, @calendar_id, @event_id, @title, @started_at, @ended_at, @day, @seconds,
      'draft', @subject_id, @goal_id, @assigned_by, @rule_id, @now, @now
    )` ).run( {
    id: crypto.randomUUID(),
    user_id: userId,
    calendar_id: calendarId,
    event_id: draft.event_id,
    title: draft.title,
    started_at: draft.started_at,
    ended_at: draft.ended_at,
    day: draft.day,
    seconds: draft.seconds,
    subject_id: draft.assignment?.subject_id ?? null,
    goal_id: draft.assignment?.goal_id ?? null,
    assigned_by: draft.assignment === null ? null : 'rule',
    rule_id: draft.assignment?.rule_id ?? null,
    now,
  } )
}

export type DraftChanges = Pick<
  NewDraft,
  'title' | 'started_at' | 'ended_at' | 'day' | 'seconds'
>

export const updateDraftEvent = (
  userId: string,
  id: string,
  changes: DraftChanges,
): void => {
  getDatabase().prepare( `UPDATE calendar_events SET title = @title, started_at = @started_at,
      ended_at = @ended_at, day = @day, seconds = @seconds, updated_at = @now
    WHERE id = @id AND user_id = @user_id AND status = 'draft'` )
    .run( { ...changes, id, user_id: userId, now: new Date().toISOString() } )
}

export const deleteEvents = ( userId: string, ids: string[] ): void => {
  const remove = getDatabase().prepare( 'DELETE FROM calendar_events WHERE id = ? AND user_id = ?' )

  for( const id of ids ) {
    remove.run( id, userId )
  }
}

export type DraftRecord = {
  id: string
  title: string
  started_at: string
  ended_at: string
  day: string
  seconds: number
  subject_id: string | null
  goal_id: string | null
  assigned_by: 'rule' | 'hand' | null
  rule_phrase: string | null
  note: string | null
}

const DRAFT_COLUMNS = `e.id, e.title, e.started_at, e.ended_at, e.day, e.seconds, e.subject_id,
  e.goal_id, e.assigned_by, r.phrase AS rule_phrase, e.note`

// The drafts waiting for review, newest first
export const listDrafts = ( userId: string ): DraftRecord[] => {
  return getDatabase().prepare( `SELECT ${ DRAFT_COLUMNS } FROM calendar_events e
    LEFT JOIN calendar_rules r ON r.id = e.rule_id
    WHERE e.user_id = ? AND e.status = 'draft' ORDER BY e.started_at DESC, e.id` )
    .all( userId ) as DraftRecord[]
}

export const findDraft = ( userId: string, id: string ): DraftRecord | undefined => {
  return getDatabase().prepare( `SELECT ${ DRAFT_COLUMNS } FROM calendar_events e
    LEFT JOIN calendar_rules r ON r.id = e.rule_id
    WHERE e.id = ? AND e.user_id = ? AND e.status = 'draft'` )
    .get( id, userId ) as DraftRecord | undefined
}

export type DraftFields = {
  // An assignment is written as a whole: target, who made it and the rule behind it
  subject_id?: string | null
  goal_id?: string | null
  assigned_by?: 'rule' | 'hand' | null
  rule_id?: string | null
  started_at?: string
  ended_at?: string
  day?: string
  seconds?: number
  note?: string | null
}

const DRAFT_FIELDS = [
  'subject_id',
  'goal_id',
  'assigned_by',
  'rule_id',
  'started_at',
  'ended_at',
  'day',
  'seconds',
  'note',
] as const

export const updateDraftFields = ( userId: string, id: string, fields: DraftFields ): void => {
  const given = DRAFT_FIELDS.filter( ( field ) => fields[ field ] !== undefined )

  if( given.length === 0 ) {
    return
  }

  getDatabase().prepare( `UPDATE calendar_events
    SET ${ given.map( ( field ) => `${ field } = @${ field }` ).join( ', ' ) }, updated_at = @now
    WHERE id = @id AND user_id = @user_id AND status = 'draft'` )
    .run( { ...fields, id, user_id: userId, now: new Date().toISOString() } )
}

// Approved keeps the time entry it made, if any; the event stays as a marker either way
export const settleDraft = (
  userId: string,
  id: string,
  status: 'approved' | 'dismissed',
  timeEntryId: string | null,
): void => {
  getDatabase().prepare( `UPDATE calendar_events
    SET status = @status, time_entry_id = @time_entry_id, updated_at = @now
    WHERE id = @id AND user_id = @user_id AND status = 'draft'` ).run( {
    status,
    time_entry_id: timeEntryId,
    now: new Date().toISOString(),
    id,
    user_id: userId,
  } )
}
