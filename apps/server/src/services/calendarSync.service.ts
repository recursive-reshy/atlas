// Shared
import type { SyncCalendarResponse } from '@atlas/shared'
// Calendar
import { CalendarAuthError, CalendarNotConnectedError } from '../calendar/auth.js'
import { listEvents } from '../calendar/calendar.client.js'
import { reconcile } from '../calendar/reconcile.js'
import { matchRule } from '../calendar/rules.js'
// Config
import { config } from '../config.js'
// Errors
import { BadGatewayError, ConflictError } from '../errors.js'
// Melete
import { instantAt } from '../melete/day.js'
// Repositories
import {
  findCalendarAccount,
  markSynced,
} from '../repositories/calendarAccount.repository.js'
import {
  countEvents,
  deleteEvents,
  insertDraft,
  listEventsForSync,
  setRuleAssignment,
  updateDraftEvent,
} from '../repositories/calendarEvents.repository.js'
import { listRules } from '../repositories/calendarRules.repository.js'
import { inTransaction } from '../repositories/database.js'
// Services
import { recordCheck } from './health.service.js'
// Themis
import { studyDay } from '../themis/periods.js'

// Titles are user content: nothing here logs them (ADR 0049)

const DAY_MS = 86_400_000
const FAILED = 'Calendar sync failed'

// The start of a study day, as an instant
const startOf = ( day: string ): Date => {
  const [ year, month, date ] = day.split( '-' ).map( Number )

  return new Date( instantAt(
    year ?? 0,
    month ?? 1,
    date ?? 1,
    config.melete.dayStartHour,
    config.timeZone,
  ) )
}

const secondsBetween = ( start: string, end: string ): number => {
  return Math.round( ( Date.parse( end ) - Date.parse( start ) ) / 1000 )
}

// Reads the window again and makes the drafts match it (ADR 0108). Nothing changes unless the
// whole read succeeded. With `olderThanSeconds`, a sync that ran more recently is skipped.
export const syncCalendar = async (
  userId: string,
  now: Date = new Date(),
  olderThanSeconds?: number,
): Promise< SyncCalendarResponse > => {
  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    throw new ConflictError( 'Calendar isn\'t connected' )
  }

  if( account.calendar_id === null || account.import_from === null ) {
    throw new ConflictError( 'Choose a calendar to import from' )
  }

  const calendarId = account.calendar_id

  if(
    olderThanSeconds !== undefined
    && account.last_synced_at !== null
    && now.getTime() - Date.parse( account.last_synced_at ) < olderThanSeconds * 1000
  ) {
    const drafts = countEvents( userId, 'draft' )

    return { added: 0, updated: 0, removed: 0, drafts, skipped: true }
  }

  const from = new Date( Math.max(
    startOf( account.import_from ).getTime(),
    now.getTime() - config.calendar.lookbackDays * DAY_MS,
  ) )

  let incoming: Awaited< ReturnType< typeof listEvents > >

  try {
    incoming = await listEvents( userId, calendarId, from, now )
  } catch( error ) {
    if( error instanceof CalendarAuthError || error instanceof CalendarNotConnectedError ) {
      throw new ConflictError( error.message )
    }

    recordCheck(
      userId,
      { kind: 'calendar_connection', id: userId },
      { ok: false, message: FAILED },
    )
    throw new BadGatewayError( FAILED )
  }

  const rules = listRules( userId )

  const result = inTransaction( () => {
    const { inserts, updates, deletes } = reconcile( {
      incoming,
      existing: listEventsForSync( userId, calendarId ),
      rules,
      from,
      now,
    } )

    for( const insert of inserts ) {
      insertDraft( userId, calendarId, {
        ...insert,
        day: studyDay( new Date( insert.started_at ) ),
        seconds: secondsBetween( insert.started_at, insert.ended_at ),
      } )
    }

    for( const { id, title, started_at, ended_at, reapply } of updates ) {
      updateDraftEvent( userId, id, {
        title,
        started_at,
        ended_at,
        day: studyDay( new Date( started_at ) ),
        seconds: secondsBetween( started_at, ended_at ),
      } )

      if( reapply ) {
        const match = matchRule( title, rules )

        setRuleAssignment( userId, id, match === undefined ? null : {
          rule_id: match.id,
          subject_id: match.subject_id,
          goal_id: match.goal_id,
        } )
      }
    }

    deleteEvents( userId, deletes )
    markSynced( userId, now.toISOString() )

    return { added: inserts.length, updated: updates.length, removed: deletes.length }
  } )

  return { ...result, drafts: countEvents( userId, 'draft' ), skipped: false }
}
