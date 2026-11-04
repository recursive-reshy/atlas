// Packages
import { z } from 'zod'

// The bgutil provider's GET /ping, checked 2026-11-04 against release 2.0.2 (server/src/main.ts)
const Ping = z.object( { server_uptime: z.number(), version: z.string() } )

const TIMEOUT_MS = 2000

const reason = ( error: unknown ): string => {
  if( error instanceof Error && error.cause instanceof Error ) {
    return error.cause.message
  }

  return error instanceof Error ? error.message : 'Unknown error'
}

export const checkPotProvider = async ( baseUrl: string ): Promise< { version: string } > => {
  const response = await fetch(
    `${ baseUrl.replace( /\/+$/, '' ) }/ping`,
    { signal: AbortSignal.timeout( TIMEOUT_MS ) },
  ).catch( ( error: unknown ) => {
    if( error instanceof DOMException && error.name === 'TimeoutError' ) {
      throw new Error( 'The PO token provider did not answer within 2 seconds' )
    }

    throw new Error( `Could not reach the PO token provider: ${ reason( error ) }` )
  } )

  if( response.status !== 200 ) {
    throw new Error( `The PO token provider answered ${ response.status }` )
  }

  const ping = Ping.safeParse( await response.json().catch( () => null ) )

  if( !ping.success ) {
    throw new Error( 'The PO token provider\'s answer was not what a provider sends' )
  }

  return { version: ping.data.version }
}
