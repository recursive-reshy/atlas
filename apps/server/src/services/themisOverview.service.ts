// Shared
import type {
  CalendarConnectionStatus,
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
  addDays,
  checkinDue,
  periodRange,
  recentWeekStarts,
  studyDay,
  weekStart,
} from '../themis/periods.js'
// Repositories
import {
  findSubject,
  listSubjectsForGoal,
  setSubjectsForGoal,
} from '../repositories/meleteSubjects.repository.js'
import type { SubjectRecord } from '../repositories/meleteSubjects.repository.js'
import { countEvents } from '../repositories/calendarEvents.repository.js'
import { listAreas } from '../repositories/themisAreas.repository.js'
import { listCheckins, listPeriodStarts } from '../repositories/themisCheckins.repository.js'
import { listGoals } from '../repositories/themisGoals.repository.js'
import type { GoalRecord } from '../repositories/themisGoals.repository.js'
import { listMetricUpdates } from '../repositories/themisMetrics.repository.js'
import { goalTimeByDay, timeByGoal } from '../repositories/timeEntries.repository.js'
import type { TimeSplit } from '../repositories/timeEntries.repository.js'
// Services
import { getCalendar } from './calendar.service.js'
import { subjectConceptStats, subjectName } from './melete.service.js'
import { requireGoal, toThemisGoal } from './themis.service.js'

// A goal card shows the last 8 updates and ratings
const RECENT = 8
const WEEKS = 12

const NO_TIME: TimeSplit = { measured: 0, logged: 0, calendar: 0 }

// Drafts count only while Calendar is connected; the status tells Home what to offer
const calendarSummary = (
  userId: string,
): { calendar_drafts: number, calendar_status: CalendarConnectionStatus } => {
  const { status } = getCalendar( userId )
  const connected = status === 'connected' || status === 'broken'

  return {
    calendar_drafts: connected ? countEvents( userId, 'draft' ) : 0,
    calendar_status: status,
  }
}

const toTime = ( { measured, logged, calendar }: TimeSplit = NO_TIME ): ThemisTime => ( {
  measured,
  logged,
  calendar,
  seconds: measured + logged + calendar,
} )

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

const cardFor = ( userId: string, goal: GoalRecord, time: ThemisTime ): ThemisGoalCard => {
  const subjects = listSubjectsForGoal( userId, goal.id )

  return {
    goal: toThemisGoal( goal ),
    time,
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

  const range = periodRange( period, today )
  const times = timeByGoal( userId, range.from, range.to )

  return {
    period,
    ...range,
    ...calendarSummary( userId ),
    checkins_due: checkinsDue,
    areas: areas.map( ( area ) => {
      const cards = goals
        .filter( ( goal ) => goal.area_id === area.id )
        .map( ( goal ) => cardFor( userId, goal, toTime( times[ goal.id ] ) ) )

      // An area's time is its active goals' time; achieved and dropped goals are left out
      return {
        id: area.id,
        name: area.name,
        position: area.position,
        time: toTime( {
          measured: cards.reduce( ( sum, { time } ) => sum + time.measured, 0 ),
          logged: cards.reduce( ( sum, { time } ) => sum + time.logged, 0 ),
          calendar: cards.reduce( ( sum, { time } ) => sum + time.calendar, 0 ),
        } ),
        goals: cards,
      }
    } ),
  }
}

export const getGoalDetail = (
  userId: string,
  id: string,
  now = new Date(),
): GetThemisGoalResponse => {
  const { goal, outcome, subjects } = cardFor( userId, requireGoal( userId, id ), toTime() )
  const weeks = recentWeekStarts( studyDay( now ), WEEKS )
  const perWeek = new Map( weeks.map( ( start ) => [ start, { ...NO_TIME } ] ) )

  for( const { day, source, seconds } of goalTimeByDay(
    userId,
    id,
    weeks[ 0 ] ?? '',
    addDays( weeks.at( -1 ) ?? '', 6 ),
  ) ) {
    const bucket = perWeek.get( weekStart( day ) )

    if( bucket !== undefined ) {
      bucket[ source ] += seconds
    }
  }

  return {
    goal,
    outcome,
    subjects,
    metric_updates: listMetricUpdates( userId, id ),
    checkins: listCheckins( userId, id ),
    time_by_week: weeks.map( ( week_start ) => ( {
      week_start,
      measured: perWeek.get( week_start )?.measured ?? 0,
      logged: perWeek.get( week_start )?.logged ?? 0,
      calendar: perWeek.get( week_start )?.calendar ?? 0,
    } ) ),
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
