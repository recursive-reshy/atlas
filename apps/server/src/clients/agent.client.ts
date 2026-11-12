// Shared
import { InstructionsResponse, LinkResponse, SyllabusResponse } from '@atlas/shared'
import type { LinkRequest, SyllabusRequest } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Logging
import { getLogContext } from '../logContext.js'

const HEALTH_TIMEOUT_MS = 2_000
const HEALTH_CACHE_MS = 30_000

export class AgentError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'AgentError'
  }
}

// The agent could not be reached or did not answer in time: nothing is known about the work
export class AgentUnavailableError extends AgentError {
  constructor( message: string ) {
    super( message )
    this.name = 'AgentUnavailableError'
  }
}

export type AgentHealth = 'ok' | 'unavailable'

let health: { status: AgentHealth, expiresAt: number } | undefined

export const clearAgentHealthCache = (): void => {
  health = undefined
}

const requireAgent = ( unconfigured: string ): NonNullable< typeof config.agent > => {
  if( config.agent === null ) {
    throw new AgentError( unconfigured )
  }

  return config.agent
}

const urlFor = ( base: string, path: string ): string => `${ base.replace( /\/+$/, '' ) }${ path }`

const isTimeout = ( error: unknown ): boolean => {
  return error instanceof Error && ( error.name === 'TimeoutError' || error.name === 'AbortError' )
}

// Sends the request and returns the parsed JSON, turning every failure into a plain AgentError
const call = async (
  path: string,
  init: {
    method: 'GET' | 'POST'
    body?: unknown
    jobId?: string
    timeoutMs?: number
    unconfigured?: string
  },
): Promise< unknown > => {
  const agent = requireAgent( init.unconfigured ?? 'Linking isn\'t configured' )
  const timeoutMs = init.timeoutMs ?? agent.timeoutMs
  let response: Response

  try {
    response = await fetch( urlFor( agent.url, path ), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${ agent.secret }`,
        ...init.jobId === undefined ? {} : { 'X-Job-Id': init.jobId },
        ...init.body === undefined ? {} : { 'Content-Type': 'application/json' },
      },
      body: init.body === undefined ? undefined : JSON.stringify( init.body ),
      signal: AbortSignal.timeout( timeoutMs ),
    } )
  } catch( error ) {
    throw new AgentUnavailableError(
      isTimeout( error )
        ? `Agent service timed out after ${ Math.round( timeoutMs / 1000 ) } s`
        : 'Agent service unreachable',
    )
  }

  if( response.status === 401 ) {
    await response.body?.cancel()

    throw new AgentError( 'Agent service rejected the secret' )
  }

  if( response.status === 422 ) {
    await response.body?.cancel()

    throw new AgentError( 'The agent service could not find your vault' )
  }

  if( !response.ok ) {
    await response.body?.cancel()

    throw new AgentError( 'Agent service returned an invalid response' )
  }

  try {
    return await response.json() as unknown
  } catch{
    throw new AgentError( 'Agent service returned an invalid response' )
  }
}

export const requestLinks = async ( request: LinkRequest ): Promise< LinkResponse > => {
  const body = await call( '/v1/link', {
    method: 'POST',
    body: request,
    jobId: getLogContext()?.job_id,
  } )
  const parsed = LinkResponse.safeParse( body )

  if( !parsed.success ) {
    throw new AgentError( 'Agent service returned an invalid response' )
  }

  return parsed.data
}

export const fetchInstructions = async (): Promise< string > => {
  const body = await call( '/v1/link/instructions', { method: 'GET' } )
  const parsed = InstructionsResponse.safeParse( body )

  if( !parsed.success ) {
    throw new AgentError( 'Agent service returned an invalid response' )
  }

  return parsed.data.instructions
}

const SYLLABUS_UNCONFIGURED = 'The agent service isn\'t configured'

// Not a job, so no X-Job-Id
export const draftSyllabusWithAgent = async (
  request: SyllabusRequest,
): Promise< SyllabusResponse > => {
  const body = await call( '/v1/syllabus', {
    method: 'POST',
    body: request,
    timeoutMs: config.agentSyllabusTimeoutMs,
    unconfigured: SYLLABUS_UNCONFIGURED,
  } )
  const parsed = SyllabusResponse.safeParse( body )

  if( !parsed.success ) {
    throw new AgentError( 'Agent service returned an invalid response' )
  }

  return parsed.data
}

export const fetchSyllabusInstructions = async (): Promise< string > => {
  const body = await call( '/v1/syllabus/instructions', {
    method: 'GET',
    unconfigured: SYLLABUS_UNCONFIGURED,
  } )
  const parsed = InstructionsResponse.safeParse( body )

  if( !parsed.success ) {
    throw new AgentError( 'Agent service returned an invalid response' )
  }

  return parsed.data.instructions
}

const probe = async ( url: string ): Promise< AgentHealth > => {
  try {
    const response = await fetch( urlFor( url, '/health' ), {
      signal: AbortSignal.timeout( HEALTH_TIMEOUT_MS ),
    } )

    await response.body?.cancel()

    return response.status === 200 ? 'ok' : 'unavailable'
  } catch{
    return 'unavailable'
  }
}

export const checkHealth = async (
  { fresh = false }: { fresh?: boolean } = {},
): Promise< AgentHealth > => {
  if( config.agent === null ) {
    return 'unavailable'
  }

  if( !fresh && health !== undefined && health.expiresAt > Date.now() ) {
    return health.status
  }

  const status = await probe( config.agent.url )

  health = { status, expiresAt: Date.now() + HEALTH_CACHE_MS }

  return status
}
