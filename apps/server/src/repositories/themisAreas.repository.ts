// Packages
import { z } from 'zod'
// Repositories
import { getDatabase, inTransaction } from './database.js'

export const AreaRecord = z.object( {
  id: z.string(),
  name: z.string(),
  position: z.int(),
  created_at: z.string(),
} )
export type AreaRecord = z.infer< typeof AreaRecord >

const SELECT = 'SELECT id, name, position, created_at FROM themis_areas'

export const findArea = ( userId: string, id: string ): AreaRecord | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT } WHERE id = ? AND user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : AreaRecord.parse( row )
}

// Names are unique per user ignoring case, which is how the unique index compares them
export const findAreaByName = ( userId: string, name: string ): AreaRecord | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT } WHERE user_id = ? AND lower( name ) = lower( ? )` )
    .get( userId, name )

  return row === undefined ? undefined : AreaRecord.parse( row )
}

export const listAreas = ( userId: string ): AreaRecord[] => {
  return z.array( AreaRecord ).parse( getDatabase()
    .prepare( `${ SELECT } WHERE user_id = ? ORDER BY position, created_at` )
    .all( userId ) )
}

export const insertArea = ( userId: string, name: string ): AreaRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO themis_areas ( id, user_id, name, position, created_at )
      VALUES ( @id, @user_id, @name, (
        SELECT COALESCE( MAX( position ) + 1, 0 ) FROM themis_areas WHERE user_id = @user_id
      ), @created_at )` )
    .run( { id, user_id: userId, name, created_at: new Date().toISOString() } )

  return AreaRecord.parse( findArea( userId, id ) )
}

export const renameArea = ( userId: string, id: string, name: string ): AreaRecord | undefined => {
  getDatabase()
    .prepare( 'UPDATE themis_areas SET name = ? WHERE id = ? AND user_id = ?' )
    .run( name, id, userId )

  return findArea( userId, id )
}

// Positions become 0…n-1 in the order given; ids that are not the user's change nothing
export const setAreaOrder = ( userId: string, orderedIds: string[] ): void => {
  inTransaction( () => {
    const update = getDatabase()
      .prepare( 'UPDATE themis_areas SET position = ? WHERE id = ? AND user_id = ?' )

    orderedIds.forEach( ( id, index ) => update.run( index, id, userId ) )
  } )
}

export const deleteArea = ( userId: string, id: string ): boolean => {
  const { changes } = getDatabase()
    .prepare( 'DELETE FROM themis_areas WHERE id = ? AND user_id = ?' )
    .run( id, userId )

  return changes > 0
}
