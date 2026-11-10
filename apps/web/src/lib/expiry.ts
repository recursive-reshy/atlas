const MINUTE_MS = 60_000
const MAX_MINUTES = 90

export const formatExpiry = ( expiresAt: string, now: number ): string => {
  const remaining = Date.parse( expiresAt ) - now

  if( remaining <= 0 ) {
    return 'expired'
  }

  if( remaining < MINUTE_MS ) {
    return 'expiring now'
  }

  const minutes = Math.ceil( remaining / MINUTE_MS )

  return minutes <= MAX_MINUTES
    ? `expires in ${ minutes }m`
    : `expires in ${ Math.ceil( minutes / 60 ) }h`
}
