// Shared
import type {
  ApproveCalendarDraftResponse,
  CalendarDraft,
  ModuleId,
  UpdateCalendarDraftBody,
} from '@atlas/shared'
// Calendar
import { measuredOverlap } from '../calendar/overlap.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import {
  findDraft,
  listDrafts,
  settleDraft,
  updateDraftFields,
} from '../repositories/calendarEvents.repository.js'
import type { DraftFields, DraftRecord } from '../repositories/calendarEvents.repository.js'
import { inTransaction } from '../repositories/database.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
import { findGoal } from '../repositories/themisGoals.repository.js'
import {
  insertCalendarEntry,
  measuredIntervals,
} from '../repositories/timeEntries.repository.js'
// Themis
import { studyDay } from '../themis/periods.js'

// Titles and notes are user content: nothing here logs them (ADR 0049)

type Target = { subject_id?: string, goal_id?: string }

const targetOf = ( { subject_id, goal_id }: DraftRecord ): Target | undefined => {
  if( subject_id !== null ) {
    return { subject_id }
  }

  return goal_id === null ? undefined : { goal_id }
}

// Measured time of the assigned subject, or of any subject linked to the assigned goal, that
// falls inside the event is not counted twice (ADR 0108). Computed here on read and once more,
// then stored, at approval.
const overlapOf = ( userId: string, draft: DraftRecord ): number => {
  const target = targetOf( draft )

  return target === undefined
    ? 0
    : measuredOverlap( draft, measuredIntervals( userId, target, draft ) )
}

const toDraft = ( userId: string, draft: DraftRecord ): CalendarDraft => {
  const overlap = overlapOf( userId, draft )

  return {
    ...draft,
    overlap_seconds: overlap,
    counts_seconds: Math.max( 0, draft.seconds - overlap ),
  }
}

export const listCalendarDrafts = ( userId: string ): CalendarDraft[] => {
  return listDrafts( userId ).map( ( draft ) => toDraft( userId, draft ) )
}

const requireDraft = ( userId: string, id: string ): DraftRecord => {
  const draft = findDraft( userId, id )

  if( draft === undefined ) {
    throw new NotFoundError( 'Draft not found' )
  }

  return draft
}

// A subject needs Melete and a goal needs Themis, both the user's own; otherwise it is as if
// it did not exist
const requireTarget = ( userId: string, modules: ModuleId[], target: Target ): void => {
  const found = target.subject_id === undefined
    ? modules.includes( 'themis' ) && findGoal( userId, target.goal_id ?? '' ) !== undefined
    : modules.includes( 'melete' ) && findSubject( userId, target.subject_id ) !== undefined

  if( !found ) {
    throw new NotFoundError(
      target.subject_id === undefined ? 'Goal not found' : 'Subject not found',
    )
  }
}

const requireTimes = ( start: string, end: string, now: Date ): void => {
  if( Date.parse( end ) <= Date.parse( start ) ) {
    throw new ValidationError( 'The end must be after the start' )
  }

  if( Date.parse( end ) > now.getTime() ) {
    throw new ValidationError( 'The event can\'t end in the future' )
  }
}

export const changeCalendarDraft = (
  userId: string,
  modules: ModuleId[],
  id: string,
  body: UpdateCalendarDraftBody,
  now: Date = new Date(),
): CalendarDraft => {
  const draft = requireDraft( userId, id )
  const fields: DraftFields = {}

  if( body.subject_id !== undefined || body.goal_id !== undefined ) {
    requireTarget( userId, modules, body )
    fields.subject_id = body.subject_id ?? null
    fields.goal_id = body.goal_id ?? null
    fields.assigned_by = 'hand'
    fields.rule_id = null
  }

  if( body.started_at !== undefined || body.ended_at !== undefined ) {
    const start = body.started_at ?? draft.started_at
    const end = body.ended_at ?? draft.ended_at

    requireTimes( start, end, now )
    fields.started_at = start
    fields.ended_at = end
    fields.day = studyDay( new Date( start ) )
    fields.seconds = Math.round( ( Date.parse( end ) - Date.parse( start ) ) / 1000 )
  }

  if( body.note !== undefined ) {
    fields.note = body.note
  }

  updateDraftFields( userId, id, fields )

  return toDraft( userId, requireDraft( userId, id ) )
}

// Records the time the event adds beyond what measured time covers, then settles the draft, in
// one transaction. Nothing is recorded when measured time covers all of it.
const approve = ( userId: string, draft: DraftRecord ): ApproveCalendarDraftResponse => {
  const target = targetOf( draft )

  if( target === undefined ) {
    throw new ConflictError( 'Assign a subject or a goal first' )
  }

  const counts = Math.max( 0, draft.seconds - overlapOf( userId, draft ) )

  return inTransaction( () => {
    const entry = counts === 0 ? undefined : insertCalendarEntry( userId, {
      subject_id: target.subject_id ?? null,
      goal_id: target.goal_id ?? null,
      day: draft.day,
      started_at: draft.started_at,
      ended_at: draft.ended_at,
      seconds: counts,
      note: draft.note,
    } )

    settleDraft( userId, draft.id, 'approved', entry?.id ?? null )

    return { time_entry_id: entry?.id ?? null, recorded_seconds: counts }
  } )
}

export const approveCalendarDraft = (
  userId: string,
  id: string,
): ApproveCalendarDraftResponse => approve( userId, requireDraft( userId, id ) )

export const approveMatchedDrafts = ( userId: string ): number => {
  const matched = listDrafts( userId ).filter( ( { assigned_by } ) => assigned_by === 'rule' )

  return inTransaction( () => {
    matched.forEach( ( draft ) => approve( userId, draft ) )

    return matched.length
  } )
}

export const dismissCalendarDraft = ( userId: string, id: string ): void => {
  requireDraft( userId, id )
  settleDraft( userId, id, 'dismissed', null )
}
