// Shared
import type {
  EditTimeEntryBody,
  LogTimeBody,
  ModuleId,
  TimeEntry,
} from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Time
import { addDays, studyDay } from '../themis/periods.js'
import { nextSession } from '../time/session.js'
// Repositories
import { findSubject } from '../repositories/meleteSubjects.repository.js'
import { findGoal } from '../repositories/themisGoals.repository.js'
import {
  deleteCalendarEntry,
  deleteLoggedEntry,
  extendMeasuredEntry,
  findTimeEntry,
  insertLoggedEntry,
  insertMeasuredEntry,
  latestMeasuredEntry,
  listTimeEntries,
  updateCalendarEntry,
  updateLoggedEntry,
} from '../repositories/timeEntries.repository.js'
import type { TimeEntryRecord } from '../repositories/timeEntries.repository.js'
// Services
import { getFinalCardSeconds, getSessionGapMinutes } from './settings.service.js'

// Called with each saved answer, inside the answer's own transaction: it extends the subject's
// open session or starts one (ADR 0091). It uses the shared connection, so it joins that
// transaction and is undone with it.
export const recordAnswerTime = ( userId: string, subjectId: string, at: Date ): void => {
  const step = nextSession( latestMeasuredEntry( userId, subjectId ), at, {
    gapMinutes: getSessionGapMinutes( userId ),
    finalCardSeconds: getFinalCardSeconds( userId ),
    dayOf: studyDay,
  } )

  if( step.kind === 'extend' ) {
    extendMeasuredEntry( userId, step.id, step )

    return
  }

  insertMeasuredEntry( userId, subjectId, step )
}

// Logged time can be back-dated up to a year, never into the future (by study day)
const BACKDATE_DAYS = 365

const requireValidDay = ( day: string, now: Date ): void => {
  const today = studyDay( now )

  if( day > today ) {
    throw new ValidationError( 'The day can\'t be in the future' )
  }

  if( day < addDays( today, -BACKDATE_DAYS ) ) {
    throw new ValidationError( 'The day is more than a year back' )
  }
}

// A subject needs Melete and a goal needs Themis, both the user's own; otherwise it is as if
// it did not exist
const requireTarget = (
  userId: string,
  modules: ModuleId[],
  body: { subject_id?: string, goal_id?: string },
): void => {
  const found = body.subject_id === undefined
    ? modules.includes( 'themis' ) && findGoal( userId, body.goal_id ?? '' ) !== undefined
    : modules.includes( 'melete' ) && findSubject( userId, body.subject_id ) !== undefined

  if( !found ) {
    throw new NotFoundError(
      body.subject_id === undefined ? 'Goal not found' : 'Subject not found',
    )
  }
}

export const logTime = (
  userId: string,
  modules: ModuleId[],
  body: LogTimeBody,
  now = new Date(),
): TimeEntry => {
  requireValidDay( body.day, now )
  requireTarget( userId, modules, body )

  return insertLoggedEntry( userId, {
    subject_id: body.subject_id ?? null,
    goal_id: body.goal_id ?? null,
    day: body.day,
    seconds: body.minutes * 60,
    note: body.note ?? null,
  } )
}

// A logged or calendar entry can be edited and deleted; a measured one is left as the answers
// made it (ADRs 0091, 0108)
const requireEditable = ( userId: string, id: string ): TimeEntryRecord => {
  const entry = findTimeEntry( userId, id )

  if( entry === undefined ) {
    throw new NotFoundError( 'Time entry not found' )
  }

  if( entry.source === 'measured' ) {
    throw new ConflictError( 'Measured time can\'t be changed' )
  }

  return entry
}

export const changeTimeEntry = (
  userId: string,
  modules: ModuleId[],
  id: string,
  body: EditTimeEntryBody,
  now = new Date(),
): TimeEntry => {
  const existing = requireEditable( userId, id )
  const retarget = body.subject_id !== undefined || body.goal_id !== undefined

  if( retarget && existing.source === 'logged' ) {
    throw new ValidationError( 'The target can\'t change: log it again against the right one' )
  }

  if( body.day !== undefined ) {
    requireValidDay( body.day, now )
  }

  if( retarget ) {
    requireTarget( userId, modules, body )
  }

  const changes = {
    day: body.day,
    note: body.note,
    seconds: body.minutes === undefined ? undefined : body.minutes * 60,
  }
  const entry = existing.source === 'logged'
    ? updateLoggedEntry( userId, id, changes )
    : updateCalendarEntry( userId, id, retarget
      ? { ...changes, subject_id: body.subject_id ?? null, goal_id: body.goal_id ?? null }
      : changes )

  if( entry === undefined ) {
    throw new NotFoundError( 'Time entry not found' )
  }

  return entry
}

export const removeTimeEntry = ( userId: string, id: string ): void => {
  if( requireEditable( userId, id ).source === 'logged' ) {
    deleteLoggedEntry( userId, id )
  } else {
    deleteCalendarEntry( userId, id )
  }
}

export const listEntries = ( userId: string, from: string, to: string ): TimeEntry[] => {
  return listTimeEntries( userId, from, to )
}
