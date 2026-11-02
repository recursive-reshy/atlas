// Express
import { Request, Response } from 'express'
// Shared
import { GetSettingsResponse, UpdateSettingsBody } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { getSettingsResponse, updateSettings } from '../services/settings.service.js'

export const getAppSettings = async (
  req: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getSettingsResponse( currentUser( req ).id ) )
}

export const patchAppSettings = async (
  req: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  const { id, role } = currentUser( req )

  await updateSettings( id, role === 'admin', UpdateSettingsBody.parse( req.body ) )

  res.status( 200 ).json( await getSettingsResponse( id ) )
}
