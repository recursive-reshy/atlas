// Packages
import { z } from 'zod'
// Shared
import { ThemisCheckinCadence, ThemisGoalStatus, ThemisOutcome } from '@atlas/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'

// The stored row, flat; the unit, target and cadence are null for the outcomes that don't use them
export const GoalRecord = z.object( {
  id: z.string(),
  area_id: z.string(),
  name: z.string(),
  position: z.int(),
  target_date: z.string().nullable(),
  status: ThemisGoalStatus,
  status_changed_at: z.string().nullable(),
  outcome: ThemisOutcome,
  metric_unit: z.string().nullable(),
  metric_target: z.number().nullable(),
  checkin_cadence: ThemisCheckinCadence.nullable(),
  created_at: z.string(),
} )
export type GoalRecord = z.infer< typeof GoalRecord >

export type NewGoal = {
  area_id: string
  name: string
  outcome: ThemisOutcome
  target_date?: string
  metric_unit?: string
  metric_target?: number
  checkin_cadence?: ThemisCheckinCadence
}

export type GoalChanges = {
  area_id?: string
  name?: string
  position?: number
  target_date?: string | null
  status?: ThemisGoalStatus
  status_changed_at?: string | null
  metric_unit?: string | null
  metric_target?: number
  checkin_cadence?: ThemisCheckinCadence
}

const COLUMNS = `id, area_id, name, position, target_date, status, status_changed_at, outcome,
  metric_unit, metric_target, checkin_cadence, created_at`

export const findGoal = ( userId: string, id: string ): GoalRecord | undefined => {
  const row = getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM themis_goals WHERE id = ? AND user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : GoalRecord.parse( row )
}

// Area order first, then each goal's place within its area
export const listGoals = ( userId: string ): GoalRecord[] => {
  return z.array( GoalRecord ).parse( getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM themis_goals WHERE user_id = ?
      ORDER BY ( SELECT a.position FROM themis_areas a WHERE a.id = area_id ),
        area_id, position, created_at` )
    .all( userId ) )
}

export const countGoalsInArea = ( userId: string, areaId: string ): number => {
  const row = getDatabase()
    .prepare( 'SELECT COUNT(*) AS count FROM themis_goals WHERE user_id = ? AND area_id = ?' )
    .get( userId, areaId ) as { count: number }

  return row.count
}

export const insertGoal = ( userId: string, goal: NewGoal ): GoalRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO themis_goals (
        id, user_id, area_id, name, position, target_date, outcome, metric_unit, metric_target,
        checkin_cadence, created_at
      ) VALUES (
        @id, @user_id, @area_id, @name, (
          SELECT COALESCE( MAX( position ) + 1, 0 ) FROM themis_goals
          WHERE user_id = @user_id AND area_id = @area_id
        ), @target_date, @outcome, @metric_unit, @metric_target, @checkin_cadence, @created_at
      )` )
    .run( {
      target_date: null,
      metric_unit: null,
      metric_target: null,
      checkin_cadence: null,
      ...goal,
      id,
      user_id: userId,
      created_at: new Date().toISOString(),
    } )

  return GoalRecord.parse( findGoal( userId, id ) )
}

const CHANGEABLE = [
  'area_id',
  'name',
  'position',
  'target_date',
  'status',
  'status_changed_at',
  'metric_unit',
  'metric_target',
  'checkin_cadence',
] as const

export const updateGoal = (
  userId: string,
  id: string,
  changes: GoalChanges,
): GoalRecord | undefined => {
  const columns = CHANGEABLE.filter( ( column ) => changes[ column ] !== undefined )

  if( columns.length > 0 ) {
    getDatabase()
      .prepare( `UPDATE themis_goals
        SET ${ columns.map( ( column ) => `${ column } = @${ column }` ).join( ', ' ) }
        WHERE id = @id AND user_id = @user_id` )
      .run( { ...changes, id, user_id: userId } )
  }

  return findGoal( userId, id )
}

// Positions become 0…n-1 in the order given (the goals of one area)
export const setGoalOrder = ( userId: string, orderedIds: string[] ): void => {
  inTransaction( () => {
    const update = getDatabase()
      .prepare( 'UPDATE themis_goals SET position = ? WHERE id = ? AND user_id = ?' )

    orderedIds.forEach( ( id, index ) => update.run( index, id, userId ) )
  } )
}

// Updates, check-ins and the goal's own logged time go with it; its subjects are unlinked
export const deleteGoal = ( userId: string, id: string ): boolean => {
  const { changes } = getDatabase()
    .prepare( 'DELETE FROM themis_goals WHERE id = ? AND user_id = ?' )
    .run( id, userId )

  return changes > 0
}
