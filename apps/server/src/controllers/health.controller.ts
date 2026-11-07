// Express
import { Request, Response } from 'express'
// Services
import { getHealthReport } from '../services/healthReport.service.js'

export const getHealth = ( _request: Request, res: Response ): void => {
  res.status( 200 ).json( getHealthReport() )
}
