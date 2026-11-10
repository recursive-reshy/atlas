// Calendar
import { matchRule } from './rules.js'
import type { MatchableRule } from './rules.js'

export type IncomingEvent = {
  event_id: string
  title: string
  started_at: string
  ended_at: string
}

export type ExistingEvent = IncomingEvent & {
  id: string
  status: 'draft' | 'approved' | 'dismissed'
  assigned_by: 'rule' | 'hand' | null
}

export type RuleAssignment = { rule_id: string, subject_id: string | null, goal_id: string | null }

export type Insert = IncomingEvent & { assignment: RuleAssignment | null }
export type Update = {
  id: string
  title: string
  started_at: string
  ended_at: string
  reapply: boolean
}

export type Reconciled = { inserts: Insert[], updates: Update[], deletes: string[] }

// Finished, timed and longer than nothing; all-day events never reach this
const isCountable = ( { started_at, ended_at }: IncomingEvent, now: Date ): boolean => {
  const start = Date.parse( started_at )
  const end = Date.parse( ended_at )

  return end > start && end <= now.getTime()
}

// What a sync changes after a complete read (ADR 0108): unknown events become drafts, drafts follow
// their event, drafts whose event is gone are deleted, approved and dismissed rows never change.
export const reconcile = ( { incoming, existing, rules, from, now }: {
  incoming: IncomingEvent[]
  existing: ExistingEvent[]
  rules: MatchableRule[]
  from: Date
  now: Date
} ): Reconciled => {
  const returned = incoming.filter( ( event ) => isCountable( event, now ) )
  const known = new Map( existing.map( ( row ) => [ row.event_id, row ] ) )
  const result: Reconciled = { inserts: [], updates: [], deletes: [] }

  for( const event of returned ) {
    const row = known.get( event.event_id )

    if( row === undefined ) {
      const match = matchRule( event.title, rules )

      result.inserts.push( { ...event, assignment: match === undefined ? null : {
        rule_id: match.id,
        subject_id: match.subject_id,
        goal_id: match.goal_id,
      } } )
    } else if( row.status === 'draft' && (
      row.title !== event.title
      || row.started_at !== event.started_at
      || row.ended_at !== event.ended_at
    ) ) {
      result.updates.push( {
        id: row.id,
        title: event.title,
        started_at: event.started_at,
        ended_at: event.ended_at,
        reapply: row.title !== event.title && row.assigned_by !== 'hand',
      } )
    }
  }

  const seen = new Set( returned.map( ( { event_id } ) => event_id ) )

  for( const row of existing ) {
    const start = Date.parse( row.started_at )

    if(
      row.status === 'draft'
      && !seen.has( row.event_id )
      && start >= from.getTime()
      && start <= now.getTime()
    ) {
      result.deletes.push( row.id )
    }
  }

  return result
}
