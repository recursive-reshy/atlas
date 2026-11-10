// Repositories
import { getDatabase } from './database.js'

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

export type RuleAssignment = {
  rule_id: string | null
  subject_id: string | null
  goal_id: string | null
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
