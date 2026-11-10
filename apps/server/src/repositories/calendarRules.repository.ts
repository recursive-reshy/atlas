// Packages
import { z } from 'zod'
// Repositories
import { getDatabase, inTransaction } from './database.js'

export const CalendarRuleRecord = z.object( {
  id: z.string(),
  phrase: z.string(),
  subject_id: z.string().nullable(),
  goal_id: z.string().nullable(),
  position: z.int(),
} )
export type CalendarRuleRecord = z.infer< typeof CalendarRuleRecord >

const SELECT = 'SELECT id, phrase, subject_id, goal_id, position FROM calendar_rules'

export type NewRule = { phrase: string, subject_id: string | null, goal_id: string | null }

// The target is replaced as a pair, so a rule never points at both
export type RuleChanges = Partial< NewRule >

export const listRules = ( userId: string ): CalendarRuleRecord[] => {
  return z.array( CalendarRuleRecord ).parse( getDatabase()
    .prepare( `${ SELECT } WHERE user_id = ? ORDER BY position, created_at, id` )
    .all( userId ) )
}

export const findRule = ( userId: string, id: string ): CalendarRuleRecord | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT } WHERE id = ? AND user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : CalendarRuleRecord.parse( row )
}

export const insertRule = ( userId: string, rule: NewRule ): CalendarRuleRecord => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  getDatabase().prepare( `INSERT INTO calendar_rules (
      id, user_id, phrase, subject_id, goal_id, position, created_at, updated_at
    ) VALUES (
      @id, @user_id, @phrase, @subject_id, @goal_id, (
        SELECT COALESCE( MAX( position ) + 1, 0 ) FROM calendar_rules WHERE user_id = @user_id
      ), @now, @now
    )` ).run( { ...rule, id, user_id: userId, now } )

  return CalendarRuleRecord.parse( findRule( userId, id ) )
}

export const updateRule = (
  userId: string,
  id: string,
  changes: RuleChanges,
): CalendarRuleRecord | undefined => {
  const given = Object.entries( changes ).filter( ( [ , value ] ) => value !== undefined )
  const sets = [ ...given.map( ( [ key ] ) => `${ key } = @${ key }` ), 'updated_at = @now' ]

  getDatabase()
    .prepare( `UPDATE calendar_rules SET ${ sets.join( ', ' ) }
      WHERE id = @id AND user_id = @user_id` )
    .run( { ...Object.fromEntries( given ), id, user_id: userId, now: new Date().toISOString() } )

  return findRule( userId, id )
}

// Positions become 0…n-1 in the order given; ids that are not the user's change nothing
export const setRuleOrder = ( userId: string, orderedIds: string[] ): void => {
  inTransaction( () => {
    const update = getDatabase()
      .prepare( 'UPDATE calendar_rules SET position = ? WHERE id = ? AND user_id = ?' )

    orderedIds.forEach( ( id, index ) => update.run( index, id, userId ) )
  } )
}

export const deleteRule = ( userId: string, id: string ): boolean => {
  const { changes } = getDatabase()
    .prepare( 'DELETE FROM calendar_rules WHERE id = ? AND user_id = ?' )
    .run( id, userId )

  return changes > 0
}
