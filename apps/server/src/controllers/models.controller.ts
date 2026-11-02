// Express
import { Request, Response } from 'express'
// Shared
import { ListModelsResponse } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { listModels } from '../services/models.service.js'

export const getModels = async (
  req: Request,
  res: Response< ListModelsResponse >,
): Promise< void > => {
  res.status( 200 ).json( await listModels( currentUser( req ).id ) )
}
