// Express
import { Router } from 'express'
// Controllers
import {
  deleteAreaRoute,
  deleteGoalRoute,
  patchArea,
  patchGoal,
  postArea,
  postCheckin,
  postGoal,
  postMetric,
} from '../controllers/themis.controller.js'

export const themisRoutes: Router = Router()

themisRoutes.post( '/themis/areas', postArea )
themisRoutes.patch( '/themis/areas/:id', patchArea )
themisRoutes.delete( '/themis/areas/:id', deleteAreaRoute )
themisRoutes.post( '/themis/goals', postGoal )
themisRoutes.patch( '/themis/goals/:id', patchGoal )
themisRoutes.delete( '/themis/goals/:id', deleteGoalRoute )
themisRoutes.post( '/themis/goals/:id/metric', postMetric )
themisRoutes.post( '/themis/goals/:id/checkins', postCheckin )
