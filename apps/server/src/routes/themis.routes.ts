// Express
import { Router } from 'express'
// Middleware
import { requireModule } from '../middleware/requireModule.js'
// Controllers
import {
  deleteAreaRoute,
  deleteGoalRoute,
  getThemisGoal,
  getThemisGoals,
  getThemisOverview,
  patchArea,
  patchGoal,
  postArea,
  postCheckin,
  postGoal,
  postMetric,
  putGoalSubjects,
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
themisRoutes.get( '/themis/overview', getThemisOverview )
themisRoutes.get( '/themis/goals', getThemisGoals )
themisRoutes.get( '/themis/goals/:id', getThemisGoal )
// Linking subjects also needs Melete, and is refused the same way without it
themisRoutes.put( '/themis/goals/:id/subjects', requireModule( 'melete' ), putGoalSubjects )
