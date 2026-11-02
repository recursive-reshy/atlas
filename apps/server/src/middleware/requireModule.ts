// Express
import type { RequestHandler } from 'express'
// Shared
import type { ModuleId } from '@atlas/shared'
// Errors
import { NotFoundError } from '../errors.js'
// Middleware
import { currentUser } from './auth.js'

// A route of a module the user doesn't have is a 404, as if it did not exist (ADR 0062). The
// admin's modules are always all of them, so this never refuses the admin.
export const requireModule = ( module: ModuleId ): RequestHandler => ( req, _res, next ) => {
  if( !currentUser( req ).modules.includes( module ) ) {
    throw new NotFoundError( 'Not Found' )
  }

  next()
}
