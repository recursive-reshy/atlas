// Express
import type { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { ModuleId, VaultDir } from '@atlas/shared'
// Middleware
import { requestScheme } from '../middleware/requestOrigin.js'
// Services
import { SESSION_COOKIE, cookieOptions } from '../services/session.service.js'
import { signInForTest } from '../services/testSession.service.js'

const Body = z.object( {
  email: z.email(),
  modules: z.array( ModuleId ).optional(),
  vault_dir: VaultDir.optional(),
} )

export const createTestSession = async ( req: Request, res: Response ): Promise< void > => {
  const body = Body.parse( req.body )
  const { token } = await signInForTest( body, new Date() )

  res.cookie( SESSION_COOKIE, token, cookieOptions( requestScheme( req ) === 'https' ) )
  res.status( 204 ).end()
}
