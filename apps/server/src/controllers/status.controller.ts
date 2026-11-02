// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { GetHealthErrorsResponse, GetStatusResponse, HealthKind } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { getHealthErrors, getStatus, refreshStatus } from '../services/status.service.js'

const ErrorsParams = z.object( { kind: HealthKind, id: z.string().min( 1 ) } )

export const readStatus = ( req: Request, res: Response< GetStatusResponse > ): void => {
  const { id, role } = currentUser( req )

  res.status( 200 ).json( getStatus( id, role === 'admin' ) )
}

export const refreshAllStatus = async (
  req: Request,
  res: Response< GetStatusResponse >,
): Promise< void > => {
  const { id, role } = currentUser( req )

  res.status( 200 ).json( await refreshStatus( id, role === 'admin' ) )
}

export const readHealthErrors = (
  req: Request,
  res: Response< GetHealthErrorsResponse >,
): void => {
  const { kind, id } = ErrorsParams.parse( req.params )
  const user = currentUser( req )

  res.status( 200 ).json( {
    errors: getHealthErrors( user.id, user.role === 'admin', kind, id ),
  } )
}
