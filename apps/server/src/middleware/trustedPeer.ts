// Express
import { NextFunction, Request, Response } from 'express'
// Errors
import { NotFoundError } from '../errors.js'
// Middleware
import { isTrustedProxy } from './requestOrigin.js'

// For routes only the machine itself, its Docker network or a private-network proxy should see.
// Anyone else gets the usual 404, as if the route did not exist.
export const requireTrustedPeer = ( req: Request, _res: Response, next: NextFunction ): void => {
  next( isTrustedProxy( req ) ? undefined : new NotFoundError( 'Not Found' ) )
}
