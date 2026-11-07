// Shared
import type {
  LogTimeBody,
  ModuleId,
  TimeEntry,
  UpdateTimeEntryBody,
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
  deleteLoggedEntry,
  extendMeasuredEntry,
  findTimeEntry,
  insertLoggedEntry,
  insertMeasuredEntry,
  latestMeasuredEntry,
  listTimeEntries,
  updateLoggedEntry,
} from '../repositories/timeEntries.repository.js'
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
const requireTarget = ( userId: string, modules: ModuleId[], body: LogTimeBody ): void => {
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

const requireLogged = ( userId: string, id: string ): void => {
  const entry = findTimeEntry( userId, id )

  if( entry === undefined ) {
    throw new NotFoundError( 'Time entry not found' )
  }

  if( entry.source !== 'logged' ) {
    throw new ConflictError( 'Measured time can\'t be changed' )
  }
}

export const changeTimeEntry = (
  userId: string,
  id: string,
  body: UpdateTimeEntryBody,
  now = new Date(),
): TimeEntry => {
  requireLogged( userId, id )

  if( body.day !== undefined ) {
    requireValidDay( body.day, now )
  }

  const entry = updateLoggedEntry( userId, id, {
    day: body.day,
    note: body.note,
    seconds: body.minutes === undefined ? undefined : body.minutes * 60,
  } )

  if( entry === undefined ) {
    throw new NotFoundError( 'Time entry not found' )
  }

  return entry
}

export const removeTimeEntry = ( userId: string, id: string ): void => {
  requireLogged( userId, id )
  deleteLoggedEntry( userId, id )
}

export const listEntries = ( userId: string, from: string, to: string ): TimeEntry[] => {
  return listTimeEntries( userId, from, to )
}
