const MINUTE_MS = 60_000
const HOUR_MINUTES = 60
const DAY_HOURS = 24

export const formatAgo = ( at: string, now: number ): string => {
  const minutes = Math.floor( ( now - Date.parse( at ) ) / MINUTE_MS )

  if( minutes < 1 ) {
    return 'just now'
  }

  if( minutes < HOUR_MINUTES ) {
    return `${ minutes }m ago`
  }

  const hours = Math.floor( minutes / HOUR_MINUTES )

  return hours < DAY_HOURS ? `${ hours }h ago` : `${ Math.floor( hours / DAY_HOURS ) }d ago`
}

export const formatChecked = ( checkedAt: string | null, now: number ): string => {
  return checkedAt === null ? 'Not checked yet' : `Checked ${ formatAgo( checkedAt, now ) }`
}
