// Shared
import { ThemisGoal } from '@atlas/shared'
import type {
  AnswerCheckinBody,
  CreateAreaBody,
  CreateGoalBody,
  LogMetricBody,
  ThemisArea,
  ThemisCheckin,
  ThemisGoalListItem,
  ThemisMetricUpdate,
  UpdateAreaBody,
  UpdateGoalBody,
} from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Themis
import { checkinDue, studyDay } from '../themis/periods.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import {
  deleteArea,
  findArea,
  findAreaByName,
  insertArea,
  listAreas,
  renameArea,
  setAreaOrder,
} from '../repositories/themisAreas.repository.js'
import { insertCheckin, listPeriodStarts } from '../repositories/themisCheckins.repository.js'
import {
  countGoalsInArea,
  deleteGoal,
  findGoal,
  insertGoal,
  listGoals,
  setGoalOrder,
  updateGoal,
} from '../repositories/themisGoals.repository.js'
import { insertMetricUpdate } from '../repositories/themisMetrics.repository.js'
import type { GoalChanges, GoalRecord } from '../repositories/themisGoals.repository.js'

// Names are user content: nothing here logs them (ADR 0049)

// Moves `id` to `index` among `ids`, a position past the end meaning the end
const reordered = ( ids: string[], id: string, index: number ): string[] => {
  const rest = ids.filter( ( other ) => other !== id )

  rest.splice( Math.min( index, rest.length ), 0, id )

  return rest
}

export const toThemisGoal = ( record: GoalRecord ): ThemisGoal => ThemisGoal.parse( record )

const requireArea = ( userId: string, id: string ): ThemisArea => {
  const area = findArea( userId, id )

  if( area === undefined ) {
    throw new NotFoundError( 'Area not found' )
  }

  return area
}

export const requireGoal = ( userId: string, id: string ): GoalRecord => {
  const goal = findGoal( userId, id )

  if( goal === undefined ) {
    throw new NotFoundError( 'Goal not found' )
  }

  return goal
}

const requireFreeName = ( userId: string, name: string, own?: string ): void => {
  const taken = findAreaByName( userId, name )

  if( taken !== undefined && taken.id !== own ) {
    throw new ConflictError( 'You already have an area with that name' )
  }
}

// Every goal, whatever its status, with its area's name (ADR 0095)
export const listAllGoals = ( userId: string ): ThemisGoalListItem[] => {
  const names = new Map( listAreas( userId ).map( ( { id, name } ) => [ id, name ] ) )

  return listGoals( userId ).map( ( record ) => ( {
    goal: toThemisGoal( record ),
    area_name: names.get( record.area_id ) ?? '',
  } ) )
}

export const createArea = ( userId: string, body: CreateAreaBody ): ThemisArea => {
  requireFreeName( userId, body.name )

  return insertArea( userId, body.name )
}

export const updateArea = ( userId: string, id: string, body: UpdateAreaBody ): ThemisArea => {
  requireArea( userId, id )

  return inTransaction( () => {
    if( body.name !== undefined ) {
      requireFreeName( userId, body.name, id )
      renameArea( userId, id, body.name )
    }

    if( body.position !== undefined ) {
      setAreaOrder(
        userId,
        reordered( listAreas( userId ).map( ( area ) => area.id ), id, body.position ),
      )
    }

    return requireArea( userId, id )
  } )
}

export const removeArea = ( userId: string, id: string ): void => {
  requireArea( userId, id )

  if( countGoalsInArea( userId, id ) > 0 ) {
    throw new ConflictError( 'Move or delete this area\'s goals first' )
  }

  deleteArea( userId, id )
}

export const createGoal = ( userId: string, body: CreateGoalBody ): ThemisGoal => {
  requireArea( userId, body.area_id )

  return toThemisGoal( insertGoal( userId, body ) )
}

const requireFieldsOfOutcome = ( goal: GoalRecord, body: UpdateGoalBody ): void => {
  const metricField = body.metric_unit !== undefined || body.metric_target !== undefined
  const cadenceField = body.checkin_cadence !== undefined

  if( metricField && goal.outcome !== 'metric' ) {
    throw new ValidationError( 'Only a metric goal has a unit and a target' )
  }

  if( cadenceField && goal.outcome !== 'checkin' ) {
    throw new ValidationError( 'Only a check-in goal has a cadence' )
  }
}

const idsInArea = ( userId: string, areaId: string ): string[] => listGoals( userId )
  .filter( ( goal ) => goal.area_id === areaId ).map( ( goal ) => goal.id )

export const changeGoal = (
  userId: string,
  id: string,
  body: UpdateGoalBody,
  now = new Date(),
): ThemisGoal => {
  const goal = requireGoal( userId, id )

  requireFieldsOfOutcome( goal, body )

  if( body.area_id !== undefined ) {
    requireArea( userId, body.area_id )
  }

  return inTransaction( () => {
    const { position, area_id: areaId, ...fields } = body
    const changes: GoalChanges = { ...fields }

    if( body.status !== undefined && body.status !== goal.status ) {
      changes.status_changed_at = body.status === 'active' ? null : now.toISOString()
    }

    const moved = areaId !== undefined && areaId !== goal.area_id

    if( moved ) {
      changes.area_id = areaId
      changes.position = countGoalsInArea( userId, areaId )
    }

    updateGoal( userId, id, changes )

    if( moved ) {
      setGoalOrder( userId, idsInArea( userId, goal.area_id ) )
    }

    if( position !== undefined ) {
      const area = requireGoal( userId, id ).area_id

      setGoalOrder( userId, reordered( idsInArea( userId, area ), id, position ) )
    }

    return toThemisGoal( requireGoal( userId, id ) )
  } )
}

export const removeGoal = ( userId: string, id: string ): void => {
  requireGoal( userId, id )
  deleteGoal( userId, id )
}

export const logMetric = (
  userId: string,
  id: string,
  body: LogMetricBody,
  now = new Date(),
): ThemisMetricUpdate => {
  if( requireGoal( userId, id ).outcome !== 'metric' ) {
    throw new ConflictError( 'Only a metric goal takes updates' )
  }

  return insertMetricUpdate( userId, id, { ...body, at: now.toISOString() } )
}

// Only the period just finished is open, and only for an active goal that existed in it
export const answerCheckin = (
  userId: string,
  id: string,
  body: AnswerCheckinBody,
  now = new Date(),
): ThemisCheckin => {
  const goal = requireGoal( userId, id )

  if( goal.outcome !== 'checkin' ) {
    throw new ConflictError( 'Only a check-in goal takes check-ins' )
  }

  const due = checkinDue(
    { ...goal, created_day: studyDay( new Date( goal.created_at ) ) },
    studyDay( now ),
    [],
  )

  if( due?.period_start !== body.period_start ) {
    throw new ValidationError( 'That period is not open for a check-in' )
  }

  if( listPeriodStarts( userId, id ).includes( body.period_start ) ) {
    throw new ConflictError( 'This period already has a check-in' )
  }

  return insertCheckin( userId, id, body )
}
