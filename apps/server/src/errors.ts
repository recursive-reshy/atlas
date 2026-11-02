// Express
import { NextFunction, Request, Response } from 'express'
// Packages
import { ZodError } from 'zod'
// Shared
import { ErrorResponse, VAULT_MISSING_MESSAGE } from '@atlas/shared'
// Logging
import { logger } from './logger.js'

export class ValidationError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'ConflictError'
  }
}

// A user who hasn't chosen a vault yet (ADR 0063); the web app sends them to choose one first
export class VaultNotChosenError extends ConflictError {
  constructor() {
    super( 'Choose your vault first' )
    this.name = 'VaultNotChosenError'
  }
}

// The user's vault folder has gone since they chose it (ADR 0070); they can choose again
export class VaultMissingError extends ConflictError {
  constructor() {
    super( VAULT_MISSING_MESSAGE )
    this.name = 'VaultMissingError'
  }
}

export class UnprocessableError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'UnprocessableError'
  }
}

// No valid session; the web app reads this exact text to show the sign-in page
export class UnauthenticatedError extends Error {
  constructor() {
    super( 'unauthenticated' )
    this.name = 'UnauthenticatedError'
  }
}

export class UnsupportedMediaTypeError extends Error {
  constructor() {
    super( 'Requests must be application/json' )
    this.name = 'UnsupportedMediaTypeError'
  }
}

// The address a sign-in request came to isn't one the app was told it is served at
export class UnknownOriginError extends Error {
  constructor() {
    super( 'This address isn\'t configured in APP_ORIGINS' )
    this.name = 'UnknownOriginError'
  }
}

// A failed backup is the one 500 whose message the user needs to read (ADR 0051).
export class BackupError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'BackupError'
  }
}

// A Melete Claude call that produced nothing usable; services store it as a failure
export class MeleteError extends Error {
  readonly usage: { input_tokens: number, output_tokens: number } | undefined

  constructor(
    message: string,
    options: { usage?: { input_tokens: number, output_tokens: number }, cause?: unknown } = {},
  ) {
    super( message, { cause: options.cause } )
    this.name = 'MeleteError'
    this.usage = options.usage
  }
}

export class BadGatewayError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'BadGatewayError'
  }
}

const sendError = ( res: Response, status: number, body: ErrorResponse ): void => {
  res.status( status ).json( body )
}

const isTooLarge = ( error: unknown ): boolean => {
  return typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.too.large'
}

const isJsonParseFailure = ( error: unknown ): boolean => {
  return typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.parse.failed'
}

export const notFoundHandler = ( _req: Request, res: Response ): void => {
  sendError( res, 404, { error: 'Not Found' } )
}

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if( res.headersSent ) {
    next( error )
    return
  }

  if( error instanceof ValidationError || error instanceof UnknownOriginError ) {
    sendError( res, 400, { error: error.message } )
  } else if( error instanceof UnauthenticatedError ) {
    sendError( res, 401, { error: error.message } )
  } else if( error instanceof UnsupportedMediaTypeError ) {
    sendError( res, 415, { error: error.message } )
  } else if( error instanceof NotFoundError ) {
    sendError( res, 404, { error: error.message } )
  } else if( error instanceof ConflictError ) {
    sendError( res, 409, { error: error.message } )
  } else if( error instanceof UnprocessableError ) {
    sendError( res, 422, { error: error.message } )
  } else if( error instanceof BackupError ) {
    sendError( res, 500, { error: error.message } )
  } else if( error instanceof BadGatewayError ) {
    sendError( res, 502, { error: error.message } )
  } else if( isTooLarge( error ) ) {
    sendError( res, 413, { error: 'Request body is too large' } )
  } else if( isJsonParseFailure( error ) ) {
    sendError( res, 400, { error: 'Invalid JSON' } )
  } else if( error instanceof ZodError ) {
    sendError( res, 400, { error: 'Invalid request', issues: error.issues } )
  } else {
    logger.error( { err: error }, 'Unhandled error' )
    sendError( res, 500, { error: 'Internal Server Error' } )
  }
}
