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
