export type Interval = { started_at: string, ended_at: string }

// The seconds of the event's window that measured entries already cover: the union of each
// entry clipped to the window, so entries that overlap each other are not subtracted twice
// (ADR 0108).
export const measuredOverlap = ( window: Interval, entries: Interval[] ): number => {
  const windowStart = Date.parse( window.started_at )
  const windowEnd = Date.parse( window.ended_at )

  const clipped = entries
    .map( ( entry ) => [
      Math.max( Date.parse( entry.started_at ), windowStart ),
      Math.min( Date.parse( entry.ended_at ), windowEnd ),
    ] as const )
    .filter( ( [ start, end ] ) => end > start )
    .sort( ( a, b ) => a[ 0 ] - b[ 0 ] )

  let covered = 0
  let reached = -Infinity

  for( const [ start, end ] of clipped ) {
    covered += Math.max( 0, end - Math.max( start, reached ) )
    reached = Math.max( reached, end )
  }

  return Math.round( covered / 1000 )
}
