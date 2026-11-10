// Shared
import {
  GetThemisGoalResponse,
  GetThemisGoalsResponse,
  GetThemisOverviewResponse,
  SetGoalSubjectsResponse,
  ThemisAreaResponse,
  ThemisCheckinResponse,
  ThemisGoalResponse,
  ThemisMetricUpdateResponse,
} from '@atlas/shared'
import type {
  AnswerCheckinBody,
  CreateAreaBody,
  CreateGoalBody,
  LogMetricBody,
  ThemisArea,
  ThemisCheckin,
  ThemisGoal,
  ThemisLinkedSubject,
  ThemisMetricUpdate,
  ThemisPeriod,
  UpdateAreaBody,
  UpdateGoalBody,
} from '@atlas/shared'
// App
import { request, send } from '#src/lib/request'

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const getThemisOverview = async (
  period: ThemisPeriod,
): Promise< GetThemisOverviewResponse > => {
  return request( `/api/themis/overview?period=${ period }`, GetThemisOverviewResponse )
}

export const createArea = async ( body: CreateAreaBody ): Promise< ThemisArea > => {
  const { area } = await request(
    '/api/themis/areas',
    ThemisAreaResponse,
    jsonInit( 'POST', body ),
  )

  return area
}

export const answerCheckin = async (
  goalId: string,
  body: AnswerCheckinBody,
): Promise< ThemisCheckin > => {
  const { checkin } = await request(
    `/api/themis/goals/${ encodeURIComponent( goalId ) }/checkins`,
    ThemisCheckinResponse,
    jsonInit( 'POST', body ),
  )

  return checkin
}

const areaPath = ( id: string ): string => `/api/themis/areas/${ encodeURIComponent( id ) }`
const goalPath = ( id: string ): string => `/api/themis/goals/${ encodeURIComponent( id ) }`

export const updateArea = async ( id: string, body: UpdateAreaBody ): Promise< ThemisArea > => {
  const { area } = await request( areaPath( id ), ThemisAreaResponse, jsonInit( 'PATCH', body ) )

  return area
}

// Refused with a 409 while the area still has goals
export const deleteArea = async ( id: string ): Promise< void > => {
  await send( areaPath( id ), { method: 'DELETE' } )
}

export const getThemisGoals = async (): Promise< GetThemisGoalsResponse > => {
  return request( '/api/themis/goals', GetThemisGoalsResponse )
}

export const getThemisGoal = async ( id: string ): Promise< GetThemisGoalResponse > => {
  return request( goalPath( id ), GetThemisGoalResponse )
}

export const createGoal = async ( body: CreateGoalBody ): Promise< ThemisGoal > => {
  const { goal } = await request(
    '/api/themis/goals',
    ThemisGoalResponse,
    jsonInit( 'POST', body ),
  )

  return goal
}

export const updateGoal = async ( id: string, body: UpdateGoalBody ): Promise< ThemisGoal > => {
  const { goal } = await request( goalPath( id ), ThemisGoalResponse, jsonInit( 'PATCH', body ) )

  return goal
}

// Removes the goal's updates, check-ins and the time logged against it
export const deleteGoal = async ( id: string ): Promise< void > => {
  await send( goalPath( id ), { method: 'DELETE' } )
}

export const logMetric = async (
  goalId: string,
  body: LogMetricBody,
): Promise< ThemisMetricUpdate > => {
  const { update } = await request(
    `${ goalPath( goalId ) }/metric`,
    ThemisMetricUpdateResponse,
    jsonInit( 'POST', body ),
  )

  return update
}

// Sets exactly this list; a subject moves over from the goal it had
export const setGoalSubjects = async (
  goalId: string,
  subjectIds: string[],
): Promise< ThemisLinkedSubject[] > => {
  const { subjects } = await request(
    `${ goalPath( goalId ) }/subjects`,
    SetGoalSubjectsResponse,
    jsonInit( 'PUT', { subject_ids: subjectIds } ),
  )

  return subjects
}
