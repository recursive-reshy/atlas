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
