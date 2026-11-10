// Shared
import type {
  CalendarRule,
  CreateCalendarRuleBody,
  ModuleId,
  UpdateCalendarRuleBody,
} from '@atlas/shared'
// Calendar
import { matchRule } from '../calendar/rules.js'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { listRuleAssignable, setRuleAssignment } from '../repositories/calendarEvents.repository.js'
import {
  deleteRule,
  findRule,
  insertRule,
  listRules,
  setRuleOrder,
  updateRule,
} from '../repositories/calendarRules.repository.js'
import type { CalendarRuleRecord, RuleChanges } from '../repositories/calendarRules.repository.js'
import { inTransaction } from '../repositories/database.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
import { findGoal } from '../repositories/themisGoals.repository.js'
// Themis
import { reordered } from '../themis/reorder.js'

// Phrases are user content: nothing here logs them (ADR 0049)

// A subject needs Melete and a goal needs Themis, both the user's own; otherwise it is as if
// it did not exist
const requireTarget = (
  userId: string,
  modules: ModuleId[],
  target: { subject_id?: string, goal_id?: string },
): void => {
  const found = target.subject_id === undefined
    ? modules.includes( 'themis' ) && findGoal( userId, target.goal_id ?? '' ) !== undefined
    : modules.includes( 'melete' ) && findSubject( userId, target.subject_id ) !== undefined

  if( !found ) {
    throw new NotFoundError(
      target.subject_id === undefined ? 'Goal not found' : 'Subject not found',
    )
  }
}

const requireRule = ( userId: string, id: string ): CalendarRuleRecord => {
  const rule = findRule( userId, id )

  if( rule === undefined ) {
    throw new NotFoundError( 'Rule not found' )
  }

  return rule
}

// Drafts with nothing assigned, or assigned by a rule, follow the rules as they now stand; drafts
// assigned by hand stay. Called inside the change's own transaction.
export const reapplyRules = ( userId: string ): void => {
  const rules = listRules( userId )

  for( const { id, title } of listRuleAssignable( userId ) ) {
    const match = matchRule( title, rules )

    setRuleAssignment( userId, id, match === undefined ? null : {
      rule_id: match.id,
      subject_id: match.subject_id,
      goal_id: match.goal_id,
    } )
  }
}

export const listCalendarRules = ( userId: string ): CalendarRule[] => listRules( userId )

export const createCalendarRule = (
  userId: string,
  modules: ModuleId[],
  body: CreateCalendarRuleBody,
): CalendarRule => {
  requireTarget( userId, modules, body )

  return inTransaction( () => {
    const rule = insertRule( userId, {
      phrase: body.phrase,
      subject_id: body.subject_id ?? null,
      goal_id: body.goal_id ?? null,
    } )

    reapplyRules( userId )

    return rule
  } )
}

export const changeCalendarRule = (
  userId: string,
  modules: ModuleId[],
  id: string,
  body: UpdateCalendarRuleBody,
): CalendarRule => {
  requireRule( userId, id )

  if( body.subject_id !== undefined || body.goal_id !== undefined ) {
    requireTarget( userId, modules, body )
  }

  return inTransaction( () => {
    const changes: RuleChanges = {}

    if( body.phrase !== undefined ) {
      changes.phrase = body.phrase
    }

    if( body.subject_id !== undefined || body.goal_id !== undefined ) {
      changes.subject_id = body.subject_id ?? null
      changes.goal_id = body.goal_id ?? null
    }

    updateRule( userId, id, changes )

    if( body.position !== undefined ) {
      setRuleOrder(
        userId,
        reordered( listRules( userId ).map( ( rule ) => rule.id ), id, body.position ),
      )
    }

    reapplyRules( userId )

    return requireRule( userId, id )
  } )
}

export const removeCalendarRule = ( userId: string, id: string ): void => {
  requireRule( userId, id )
  inTransaction( () => {
    deleteRule( userId, id )
    reapplyRules( userId )
  } )
}
