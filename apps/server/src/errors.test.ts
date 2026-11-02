// Packages
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from 'vitest'
import request from 'supertest'
import express, {
  Express,
  NextFunction,
  Request,
  Response,
} from 'express'
import { z } from 'zod'
// Errors
import {
  BadGatewayError,
  ConflictError,
  ForbiddenError,
  VaultMissingError,
  VaultNotChosenError,
  NotFoundError,
  UnauthenticatedError,
  UnknownOriginError,
  UnsupportedMediaTypeError,
  UnprocessableError,
  ValidationError,
  errorMiddleware,
  notFoundHandler,
} from './errors.js'
// Logging
import { logger } from './logger.js'

const buildApp = (): Express => {
  const testApp: Express = express()

  testApp.get( '/validation', () => {
    throw new ValidationError( 'Bad url' )
  } )
  testApp.get( '/not-found', () => {
    throw new NotFoundError( 'Job not found' )
  } )
  testApp.get( '/conflict', () => {
    throw new ConflictError( 'Job not done' )
  } )
  testApp.get( '/vault-not-chosen', () => {
    throw new VaultNotChosenError()
  } )
  testApp.get( '/vault-missing', () => {
    throw new VaultMissingError()
  } )
  testApp.get( '/bad-gateway', () => {
    throw new BadGatewayError( "Couldn't reach the site" )
  } )
  testApp.get( '/forbidden', () => {
    throw new ForbiddenError( 'Not yours to do' )
  } )
  testApp.get( '/unprocessable', () => {
    throw new UnprocessableError( 'Could not summarize "A post"' )
  } )
  testApp.get( '/unauthenticated', () => {
    throw new UnauthenticatedError()
  } )
  testApp.get( '/unsupported', () => {
    throw new UnsupportedMediaTypeError()
  } )
  testApp.get( '/origin', () => {
    throw new UnknownOriginError()
  } )
  testApp.get( '/zod', () => {
    z.object( { url: z.string() } ).parse( { url: 42 } )
  } )
  testApp.get( '/boom', () => {
    throw new Error( 'boom' )
  } )
  testApp.get( '/async', async () => {
    await Promise.reject( new NotFoundError( 'Job not found' ) )
  } )

  testApp.use( '/api', notFoundHandler )
  testApp.use( errorMiddleware )

  return testApp
}

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'errorMiddleware, bad gateway', () => {
  it( 'maps BadGatewayError to 502 with its message', async () => {
    const response = await request( buildApp() ).get( '/bad-gateway' )

    expect( response.status ).toBe( 502 )
    expect( response.body ).toEqual( { error: "Couldn't reach the site" } )
  } )
} )

describe( 'errorMiddleware', () => {
  it( 'maps ValidationError to 400', async () => {
    const response = await request( buildApp() ).get( '/validation' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Bad url' } )
  } )

  it( 'maps NotFoundError to 404', async () => {
    const response = await request( buildApp() ).get( '/not-found' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'maps ConflictError to 409', async () => {
    const response = await request( buildApp() ).get( '/conflict' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Job not done' } )
  } )

  it( 'maps VaultMissingError to 409 with its fixed message', async () => {
    const response = await request( buildApp() ).get( '/vault-missing' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Your vault folder is missing' } )
  } )

  it( 'maps VaultNotChosenError to 409 with its fixed message', async () => {
    const response = await request( buildApp() ).get( '/vault-not-chosen' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose your vault first' } )
  } )

  it( 'maps ForbiddenError to 403 with its message', async () => {
    const response = await request( buildApp() ).get( '/forbidden' )

    expect( response.status ).toBe( 403 )
    expect( response.body ).toEqual( { error: 'Not yours to do' } )
  } )

  it( 'maps UnprocessableError to 422 with its message', async () => {
    const response = await request( buildApp() ).get( '/unprocessable' )

    expect( response.status ).toBe( 422 )
    expect( response.body ).toEqual( { error: 'Could not summarize "A post"' } )
  } )

  it( 'maps UnauthenticatedError to 401 with the code the web app looks for', async () => {
    const response = await request( buildApp() ).get( '/unauthenticated' )

    expect( response.status ).toBe( 401 )
    expect( response.body ).toEqual( { error: 'unauthenticated' } )
  } )

  it( 'maps UnsupportedMediaTypeError to 415', async () => {
    const response = await request( buildApp() ).get( '/unsupported' )

    expect( response.status ).toBe( 415 )
    expect( response.body ).toEqual( { error: 'Requests must be application/json' } )
  } )

  it( 'maps UnknownOriginError to 400 naming APP_ORIGINS', async () => {
    const response = await request( buildApp() ).get( '/origin' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( {
      error: 'This address isn\'t configured in APP_ORIGINS',
    } )
  } )

  it( 'maps ZodError to 400 with its issues', async () => {
    const response = await request( buildApp() ).get( '/zod' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( {
      error: 'Invalid request',
      issues: [ expect.objectContaining( { code: 'invalid_type', path: [ 'url' ] } ) ],
    } )
  } )

  it( 'logs an unexpected error and responds with a generic 500', async () => {
    const consoleError = vi.spyOn( logger, 'error' ).mockImplementation( () => {} )

    const response = await request( buildApp() ).get( '/boom' )

    expect( response.status ).toBe( 500 )
    expect( response.body ).toEqual( { error: 'Internal Server Error' } )
    expect( response.text ).not.toContain( 'boom' )
    expect( consoleError ).toHaveBeenCalledWith(
      { err: expect.objectContaining( { message: 'boom' } ) as unknown },
      'Unhandled error',
    )
  } )

  it( 'forwards a rejected async handler to the middleware', async () => {
    const response = await request( buildApp() ).get( '/async' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'passes the error to next when headers were already sent', () => {
    const error = new Error( 'late failure' )
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() }
    const next = vi.fn()

    errorMiddleware( error, {} as Request, res as unknown as Response, next as NextFunction )

    expect( next ).toHaveBeenCalledWith( error )
    expect( res.status ).not.toHaveBeenCalled()
    expect( res.json ).not.toHaveBeenCalled()
  } )
} )

describe( 'errorMiddleware with malformed JSON', () => {
  it( 'maps a body-parser parse failure to 400 Invalid JSON', async () => {
    const testApp: Express = express()
    testApp.use( express.json() )
    testApp.post( '/echo', ( _req, res ) => {
      res.json( {} )
    } )
    testApp.use( errorMiddleware )

    const response = await request( testApp )
      .post( '/echo' )
      .set( 'content-type', 'application/json' )
      .send( '{"url":' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Invalid JSON' } )
  } )
} )
