// Node
import { randomBytes } from 'node:crypto'

const STATE_TTL_MS = 10 * 60 * 1000
const MAX_STATES = 20

type PendingConsent = { userId: string, origin: string, expiresAt: number }

export type OAuthStateStore = {
  create: ( userId: string, origin: string ) => string
  consume: ( userId: string, state: string ) => { origin: string } | undefined
}

// One store per Google feature. A state belongs to the user who asked for it and to the
// origin they asked from; it is spent on first use, even when it is refused.
export const createOAuthStateStore = (): OAuthStateStore => {
  const states = new Map< string, PendingConsent >()

  return {
    create: ( userId, origin ) => {
      const state = randomBytes( 32 ).toString( 'hex' )

      states.set( state, { userId, origin, expiresAt: Date.now() + STATE_TTL_MS } )

      while( states.size > MAX_STATES ) {
        states.delete( states.keys().next().value! )
      }

      return state
    },
    consume: ( userId, state ) => {
      const pending = states.get( state )

      states.delete( state )

      if( pending === undefined || pending.expiresAt < Date.now() || pending.userId !== userId ) {
        return undefined
      }

      return { origin: pending.origin }
    },
  }
}
