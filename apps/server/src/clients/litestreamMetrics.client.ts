// Metric names from Litestream 0.5's Prometheus endpoint (litestream.io/reference/metrics, read
// 2026-11-02): both are counters, labelled by database. There is no last-sync timestamp metric
// (only the unix-socket /list has `last_sync_at`), so the check derives "last synced" from
// `syncCount` rising between two checks.
const LITESTREAM_METRICS = {
  syncCount: 'litestream_sync_count',
  syncErrors: 'litestream_sync_error_count',
} as const

const TIMEOUT_MS = 2000

export type ReplicationMetrics = { syncCount: number, syncErrors: number }

// `name{labels} value [timestamp]`; a counter with several series (one per database) is summed.
const sumOf = ( lines: string[], name: string ): number => {
  return lines
    .map( ( line ) => {
      const rest = line.startsWith( name ) ? line.slice( name.length ) : null

      // The next character must end the name, so `litestream_sync_count_total` doesn't match
      if( rest === null || !/^[{ ]/.test( rest ) ) {
        return 0
      }

      const value = Number( rest.replace( /^\{[^}]*\}/, '' ).trim().split( /\s+/ )[ 0 ] )

      return Number.isFinite( value ) ? value : 0
    } )
    .reduce( ( total, value ) => total + value, 0 )
}

export const parseReplicationMetrics = ( text: string ): ReplicationMetrics => {
  const lines = text.split( '\n' ).map( ( line ) => line.trim() ).filter( ( line ) => {
    return line !== '' && !line.startsWith( '#' )
  } )

  return {
    syncCount: sumOf( lines, LITESTREAM_METRICS.syncCount ),
    syncErrors: sumOf( lines, LITESTREAM_METRICS.syncErrors ),
  }
}

const reason = ( error: unknown ): string => {
  if( error instanceof Error && error.cause instanceof Error ) {
    return error.cause.message
  }

  return error instanceof Error ? error.message : 'Unknown error'
}

export const fetchReplicationMetrics = async ( url: string ): Promise< ReplicationMetrics > => {
  const response = await fetch( url, { signal: AbortSignal.timeout( TIMEOUT_MS ) } )
    .catch( ( error: unknown ) => {
      if( error instanceof DOMException && error.name === 'TimeoutError' ) {
        throw new Error( 'Litestream\'s metrics did not answer within 2 seconds' )
      }

      throw new Error( `Could not reach Litestream's metrics: ${ reason( error ) }` )
    } )

  if( response.status !== 200 ) {
    throw new Error( `Litestream's metrics answered ${ response.status }` )
  }

  return parseReplicationMetrics( await response.text() )
}
