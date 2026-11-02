// Express
import { Request, Response } from 'express'
// Shared
import { ListFoldersResponse } from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { listFolders } from '../services/vault.service.js'

export const getFolders = async (
  req: Request,
  res: Response< ListFoldersResponse >,
): Promise< void > => {
  res.status( 200 ).json( await listFolders( currentUser( req ).id ) )
}
