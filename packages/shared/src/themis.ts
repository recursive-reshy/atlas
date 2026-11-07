// Packages
import { z } from 'zod'

// ADR 0092: areas hold goals; a goal has one outcome type, fixed when it is made

export const ThemisOutcome = z.enum( [ 'learning', 'metric', 'checkin' ] )
export type ThemisOutcome = z.infer< typeof ThemisOutcome >

export const ThemisGoalStatus = z.enum( [ 'active', 'achieved', 'dropped' ] )
export type ThemisGoalStatus = z.infer< typeof ThemisGoalStatus >

export const ThemisCheckinCadence = z.enum( [ 'weekly', 'monthly' ] )
export type ThemisCheckinCadence = z.infer< typeof ThemisCheckinCadence >

const Name = z.string().trim().min( 1 ).max( 120 )
const Position = z.int().min( 0 )

// A real calendar date as YYYY-MM-DD
export const CalendarDate = z.string().regex( /^\d{4}-\d{2}-\d{2}$/ ).refine( ( value ) => {
  const [ year, month, day ] = value.split( '-' ).map( Number )
  const date = new Date( Date.UTC( year, month - 1, day ) )

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}, 'Not a calendar date' )
export type CalendarDate = z.infer< typeof CalendarDate >

export const ThemisArea = z.object( {
  id: z.uuid(),
  name: z.string(),
  position: z.int(),
  created_at: z.string(),
} )
export type ThemisArea = z.infer< typeof ThemisArea >

const GoalBase = {
  id: z.uuid(),
  area_id: z.uuid(),
  name: z.string(),
  position: z.int(),
  target_date: z.string().nullable(),
  status: ThemisGoalStatus,
  status_changed_at: z.string().nullable(),
  created_at: z.string(),
}

export const ThemisGoal = z.discriminatedUnion( 'outcome', [
  z.object( { ...GoalBase, outcome: z.literal( 'learning' ) } ),
  z.object( {
    ...GoalBase,
    outcome: z.literal( 'metric' ),
    metric_unit: z.string().nullable(),
    metric_target: z.number(),
  } ),
  z.object( {
    ...GoalBase,
    outcome: z.literal( 'checkin' ),
    checkin_cadence: ThemisCheckinCadence,
  } ),
] )
export type ThemisGoal = z.infer< typeof ThemisGoal >

export const CreateAreaBody = z.strictObject( { name: Name } )
export type CreateAreaBody = z.infer< typeof CreateAreaBody >

export const UpdateAreaBody = z.strictObject( {
  name: Name.optional(),
  position: Position.optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide name or position' },
)
export type UpdateAreaBody = z.infer< typeof UpdateAreaBody >

const MetricUnit = z.string().trim().min( 1 ).max( 20 )

const NewGoalBase = {
  area_id: z.uuid(),
  name: Name,
  target_date: CalendarDate.optional(),
}

export const CreateGoalBody = z.discriminatedUnion( 'outcome', [
  z.strictObject( { ...NewGoalBase, outcome: z.literal( 'learning' ) } ),
  z.strictObject( {
    ...NewGoalBase,
    outcome: z.literal( 'metric' ),
    metric_unit: MetricUnit.optional(),
    metric_target: z.number().finite(),
  } ),
  z.strictObject( {
    ...NewGoalBase,
    outcome: z.literal( 'checkin' ),
    checkin_cadence: ThemisCheckinCadence,
  } ),
] )
export type CreateGoalBody = z.infer< typeof CreateGoalBody >

// No `outcome`: the type can't change. The unit, target and cadence apply only to goals of that
// outcome, which the server checks against the stored goal.
export const UpdateGoalBody = z.strictObject( {
  name: Name.optional(),
  area_id: z.uuid().optional(),
  position: Position.optional(),
  target_date: CalendarDate.nullable().optional(),
  status: ThemisGoalStatus.optional(),
  metric_unit: MetricUnit.nullable().optional(),
  metric_target: z.number().finite().optional(),
  checkin_cadence: ThemisCheckinCadence.optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide a field to change' },
)
export type UpdateGoalBody = z.infer< typeof UpdateGoalBody >

export const ThemisAreaResponse = z.object( { area: ThemisArea } )
export type ThemisAreaResponse = z.infer< typeof ThemisAreaResponse >

export const ThemisGoalResponse = z.object( { goal: ThemisGoal } )
export type ThemisGoalResponse = z.infer< typeof ThemisGoalResponse >

export const ThemisMetricUpdate = z.object( {
  id: z.int(),
  value: z.number(),
  note: z.string().nullable(),
  at: z.string(),
} )
export type ThemisMetricUpdate = z.infer< typeof ThemisMetricUpdate >

export const LogMetricBody = z.strictObject( {
  value: z.number().finite(),
  note: z.string().trim().min( 1 ).max( 500 ).optional(),
} )
export type LogMetricBody = z.infer< typeof LogMetricBody >

export const ThemisMetricUpdateResponse = z.object( { update: ThemisMetricUpdate } )
export type ThemisMetricUpdateResponse = z.infer< typeof ThemisMetricUpdateResponse >

export const ThemisCheckin = z.object( {
  id: z.int(),
  period_start: z.string(),
  rating: z.int().min( 1 ).max( 5 ),
  note: z.string().nullable(),
  created_at: z.string(),
} )
export type ThemisCheckin = z.infer< typeof ThemisCheckin >

export const AnswerCheckinBody = z.strictObject( {
  period_start: CalendarDate,
  rating: z.int().min( 1 ).max( 5 ),
  note: z.string().trim().min( 1 ).max( 500 ).optional(),
} )
export type AnswerCheckinBody = z.infer< typeof AnswerCheckinBody >

export const ThemisCheckinResponse = z.object( { checkin: ThemisCheckin } )
export type ThemisCheckinResponse = z.infer< typeof ThemisCheckinResponse >

export const ThemisPeriod = z.enum( [ 'week', 'month', 'quarter' ] )
export type ThemisPeriod = z.infer< typeof ThemisPeriod >

// Seconds of study and logged time; `seconds` is their sum (ADR 0091)
export const ThemisTime = z.object( {
  seconds: z.int().min( 0 ),
  measured: z.int().min( 0 ),
  logged: z.int().min( 0 ),
} )
export type ThemisTime = z.infer< typeof ThemisTime >

export const ThemisLinkedSubject = z.object( { id: z.uuid(), name: z.string() } )
export type ThemisLinkedSubject = z.infer< typeof ThemisLinkedSubject >

const Roll = z.number().min( 0 ).max( 1 ).nullable()

// What a goal shows as progress, by outcome type; the last 8 updates and ratings
export const ThemisGoalOutcome = z.discriminatedUnion( 'type', [
  z.object( {
    type: z.literal( 'learning' ),
    coverage: Roll,
    mastery: Roll,
    concept_count: z.int().min( 0 ),
  } ),
  z.object( {
    type: z.literal( 'metric' ),
    unit: z.string().nullable(),
    target: z.number(),
    latest: z.number().nullable(),
    updates: z.array( ThemisMetricUpdate ),
  } ),
  z.object( {
    type: z.literal( 'checkin' ),
    cadence: ThemisCheckinCadence,
    ratings: z.array( ThemisCheckin ),
  } ),
] )
export type ThemisGoalOutcome = z.infer< typeof ThemisGoalOutcome >

export const ThemisGoalCard = z.object( {
  goal: ThemisGoal,
  time: ThemisTime,
  outcome: ThemisGoalOutcome,
  subjects: z.array( ThemisLinkedSubject ),
} )
export type ThemisGoalCard = z.infer< typeof ThemisGoalCard >

export const ThemisOverviewArea = z.object( {
  id: z.uuid(),
  name: z.string(),
  position: z.int(),
  time: ThemisTime,
  goals: z.array( ThemisGoalCard ),
} )
export type ThemisOverviewArea = z.infer< typeof ThemisOverviewArea >

export const ThemisCheckinDue = z.object( {
  goal_id: z.uuid(),
  goal_name: z.string(),
  area_id: z.uuid(),
  area_name: z.string(),
  cadence: ThemisCheckinCadence,
  period_start: z.string(),
  period_end: z.string(),
} )
export type ThemisCheckinDue = z.infer< typeof ThemisCheckinDue >

export const GetThemisOverviewResponse = z.object( {
  period: ThemisPeriod,
  from: z.string(),
  to: z.string(),
  checkins_due: z.array( ThemisCheckinDue ),
  areas: z.array( ThemisOverviewArea ),
} )
export type GetThemisOverviewResponse = z.infer< typeof GetThemisOverviewResponse >

export const ThemisWeekTime = z.object( {
  week_start: z.string(),
  measured: z.int().min( 0 ),
  logged: z.int().min( 0 ),
} )
export type ThemisWeekTime = z.infer< typeof ThemisWeekTime >

export const GetThemisGoalResponse = z.object( {
  goal: ThemisGoal,
  outcome: ThemisGoalOutcome,
  subjects: z.array( ThemisLinkedSubject ),
  metric_updates: z.array( ThemisMetricUpdate ),
  checkins: z.array( ThemisCheckin ),
  time_by_week: z.array( ThemisWeekTime ),
} )
export type GetThemisGoalResponse = z.infer< typeof GetThemisGoalResponse >

export const SetGoalSubjectsBody = z.strictObject( {
  subject_ids: z.array( z.uuid() ).max( 200 ),
} )
export type SetGoalSubjectsBody = z.infer< typeof SetGoalSubjectsBody >

export const SetGoalSubjectsResponse = z.object( { subjects: z.array( ThemisLinkedSubject ) } )
export type SetGoalSubjectsResponse = z.infer< typeof SetGoalSubjectsResponse >
