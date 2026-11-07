// Shared
import {
  GetThemisOverviewResponse,
  ThemisAreaResponse,
  ThemisCheckinResponse,
} from '@atlas/shared'
import type {
  AnswerCheckinBody,
  CreateAreaBody,
  ThemisArea,
  ThemisCheckin,
  ThemisPeriod,
} from '@atlas/shared'
// App
import { request } from './request'

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
