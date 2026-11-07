// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  AnswerCheckinBody,
  CreateAreaBody,
  CreateGoalBody,
  LogMetricBody,
  ThemisAreaResponse,
  ThemisCheckinResponse,
  ThemisGoalResponse,
  ThemisMetricUpdateResponse,
  UpdateAreaBody,
  UpdateGoalBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  answerCheckin,
  changeGoal,
  createArea,
  createGoal,
  logMetric,
  removeArea,
  removeGoal,
  updateArea,
} from '../services/themis.service.js'

const Id = z.uuid()

export const postArea = (
  req: Request,
  res: Response< ThemisAreaResponse >,
): void => {
  const area = createArea( currentUser( req ).id, CreateAreaBody.parse( req.body ) )

  res.status( 201 ).json( { area } )
}

export const patchArea = (
  req: Request,
  res: Response< ThemisAreaResponse >,
): void => {
  const area = updateArea(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    UpdateAreaBody.parse( req.body ),
  )

  res.status( 200 ).json( { area } )
}

export const deleteAreaRoute = ( req: Request, res: Response ): void => {
  removeArea( currentUser( req ).id, Id.parse( req.params.id ) )
  res.status( 204 ).end()
}

export const postGoal = (
  req: Request,
  res: Response< ThemisGoalResponse >,
): void => {
  const goal = createGoal( currentUser( req ).id, CreateGoalBody.parse( req.body ) )

  res.status( 201 ).json( { goal } )
}

export const patchGoal = (
  req: Request,
  res: Response< ThemisGoalResponse >,
): void => {
  const goal = changeGoal(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    UpdateGoalBody.parse( req.body ),
  )

  res.status( 200 ).json( { goal } )
}

export const deleteGoalRoute = ( req: Request, res: Response ): void => {
  removeGoal( currentUser( req ).id, Id.parse( req.params.id ) )
  res.status( 204 ).end()
}

export const postMetric = (
  req: Request,
  res: Response< ThemisMetricUpdateResponse >,
): void => {
  const update = logMetric(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    LogMetricBody.parse( req.body ),
  )

  res.status( 201 ).json( { update } )
}

export const postCheckin = (
  req: Request,
  res: Response< ThemisCheckinResponse >,
): void => {
  const checkin = answerCheckin(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    AnswerCheckinBody.parse( req.body ),
  )

  res.status( 201 ).json( { checkin } )
}
