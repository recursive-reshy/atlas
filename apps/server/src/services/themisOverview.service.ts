// Shared
import type {
  GetThemisGoalResponse,
  GetThemisOverviewResponse,
  SetGoalSubjectsBody,
  SetGoalSubjectsResponse,
  ThemisGoalCard,
  ThemisGoalOutcome,
  ThemisLinkedSubject,
  ThemisPeriod,
  ThemisTime,
} from '@atlas/shared'
// Errors
import { NotFoundError } from '../errors.js'
// Themis
import { pooledLearning } from '../themis/overview.js'
import {
  checkinDue,
  periodRange,
  recentWeekStarts,
  studyDay,
} from '../themis/periods.js'
// Repositories
import {
  findSubject,
  listSubjectsForGoal,
  setSubjectsForGoal,
} from '../repositories/meleteSubjects.repository.js'
import type { SubjectRecord } from '../repositories/meleteSubjects.repository.js'
import { listAreas } from '../repositories/themisAreas.repository.js'
import { listCheckins, listPeriodStarts } from '../repositories/themisCheckins.repository.js'
import { listGoals } from '../repositories/themisGoals.repository.js'
import type { GoalRecord } from '../repositories/themisGoals.repository.js'
import { listMetricUpdates } from '../repositories/themisMetrics.repository.js'
// Services
import { subjectConceptStats, subjectName } from './melete.service.js'
import { requireGoal, toThemisGoal } from './themis.service.js'

// A goal card shows the last 8 updates and ratings
const RECENT = 8
const WEEKS = 12

// Time arrives with task 7.2
const NO_TIME: ThemisTime = { seconds: 0, measured: 0, logged: 0 }

const linked = ( subjects: SubjectRecord[] ): ThemisLinkedSubject[] => {
  return subjects.map( ( { id, folder } ) => ( { id, name: subjectName( folder ) } ) )
}

const outcomeOf = (
  userId: string,
  goal: GoalRecord,
  subjects: SubjectRecord[],
): ThemisGoalOutcome => {
  if( goal.outcome === 'metric' ) {
    const updates = listMetricUpdates( userId, goal.id, RECENT )

    return {
      type: 'metric',
      unit: goal.metric_unit,
      target: goal.metric_target ?? 0,
      latest: updates[ 0 ]?.value ?? null,
      updates,
    }
  }

  if( goal.outcome === 'checkin' ) {
    return {
      type: 'checkin',
      cadence: goal.checkin_cadence ?? 'weekly',
      ratings: listCheckins( userId, goal.id, RECENT ),
    }
  }

  return {
    type: 'learning',
    ...pooledLearning( subjects.map( ( subject ) => subjectConceptStats( userId, subject ) ) ),
  }
}

const cardFor = ( userId: string, goal: GoalRecord ): ThemisGoalCard => {
  const subjects = listSubjectsForGoal( userId, goal.id )

  return {
    goal: toThemisGoal( goal ),
    time: NO_TIME,
    outcome: outcomeOf( userId, goal, subjects ),
    subjects: linked( subjects ),
  }
}

export const getOverview = (
  userId: string,
  period: ThemisPeriod,
  now = new Date(),
): GetThemisOverviewResponse => {
  const today = studyDay( now )
  const areas = listAreas( userId )
  const goals = listGoals( userId ).filter( ( { status } ) => status === 'active' )

  const checkinsDue = goals.flatMap( ( goal ) => {
    const due = checkinDue(
      { ...goal, created_day: studyDay( new Date( goal.created_at ) ) },
      today,
      listPeriodStarts( userId, goal.id ),
    )
    const area = areas.find( ( { id } ) => id === goal.area_id )

    if( due === null || goal.checkin_cadence === null || area === undefined ) {
      return []
    }

    return [ {
      goal_id: goal.id,
      goal_name: goal.name,
      area_id: area.id,
      area_name: area.name,
      cadence: goal.checkin_cadence,
      ...due,
    } ]
  } )

  return {
    period,
    ...periodRange( period, today ),
    checkins_due: checkinsDue,
    areas: areas.map( ( area ) => ( {
      id: area.id,
      name: area.name,
      position: area.position,
      time: NO_TIME,
      goals: goals
        .filter( ( goal ) => goal.area_id === area.id )
        .map( ( goal ) => cardFor( userId, goal ) ),
    } ) ),
  }
}

export const getGoalDetail = (
  userId: string,
  id: string,
  now = new Date(),
): GetThemisGoalResponse => {
  const { goal, outcome, subjects } = cardFor( userId, requireGoal( userId, id ) )

  return {
    goal,
    outcome,
    subjects,
    metric_updates: listMetricUpdates( userId, id ),
    checkins: listCheckins( userId, id ),
    time_by_week: recentWeekStarts( studyDay( now ), WEEKS )
      .map( ( week_start ) => ( { week_start, measured: 0, logged: 0 } ) ),
  }
}

// The goal's subjects become exactly these; a subject belongs to at most one goal, so it moves
// over from the goal it had
export const setGoalSubjects = (
  userId: string,
  id: string,
  body: SetGoalSubjectsBody,
): SetGoalSubjectsResponse => {
  requireGoal( userId, id )

  const ids = [ ...new Set( body.subject_ids ) ]

  if( ids.some( ( subjectId ) => findSubject( userId, subjectId ) === undefined ) ) {
    throw new NotFoundError( 'Subject not found' )
  }

  setSubjectsForGoal( userId, id, ids )

  return { subjects: linked( listSubjectsForGoal( userId, id ) ) }
}
