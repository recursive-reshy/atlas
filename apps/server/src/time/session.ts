// Measured study time (ADR 0091): answers in one subject that are close together are one
// session, timed from its first answer to its last plus a credit for the last card. Pure: the
// settings and the day boundary are arguments.

export type OpenSession = {
  id: string
  started_at: string
  ended_at: string
  day: string
}

export type SessionOptions = {
  gapMinutes: number
  finalCardSeconds: number
  dayOf: ( at: Date ) => string
}

// An extension keeps the session's start and the day it started on, so it names neither
export type SessionStep =
  | { kind: 'extend', id: string, ended_at: string, seconds: number }
  | { kind: 'start', started_at: string, ended_at: string, day: string, seconds: number }

// The table's CHECK wants a positive number, so a session is at least a second
const secondsOf = ( startedMs: number, endedMs: number, credit: number ): number => {
  return Math.max( 1, Math.floor( ( endedMs - startedMs ) / 1000 ) + credit )
}

export const nextSession = (
  latest: OpenSession | undefined,
  at: Date,
  { gapMinutes, finalCardSeconds, dayOf }: SessionOptions,
): SessionStep => {
  const atMs = at.getTime()

  if( latest !== undefined && atMs - Date.parse( latest.ended_at ) <= gapMinutes * 60_000 ) {
    const endedMs = Math.max( Date.parse( latest.ended_at ), atMs )

    return {
      kind: 'extend',
      id: latest.id,
      ended_at: new Date( endedMs ).toISOString(),
      seconds: secondsOf( Date.parse( latest.started_at ), endedMs, finalCardSeconds ),
    }
  }

  const stamp = at.toISOString()

  return {
    kind: 'start',
    started_at: stamp,
    ended_at: stamp,
    day: dayOf( at ),
    seconds: secondsOf( atMs, atMs, finalCardSeconds ),
  }
}
