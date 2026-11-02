// Shared
import { ModuleId } from '@atlas/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'

// A row means "on" (the admin's modules are not stored; they are every module)
export const listModules = ( userId: string ): ModuleId[] => {
  const rows = getDatabase()
    .prepare( 'SELECT module FROM user_modules WHERE user_id = ? ORDER BY rowid' )
    .all( userId ) as { module: string }[]

  return rows.map( ( { module } ) => ModuleId.parse( module ) )
}

// Replaces the whole set in one transaction, so a bad value leaves the old set in place
export const setModules = ( userId: string, modules: ModuleId[] ): void => {
  inTransaction( () => {
    getDatabase().prepare( 'DELETE FROM user_modules WHERE user_id = ?' ).run( userId )

    const insert = getDatabase()
      .prepare( 'INSERT INTO user_modules ( user_id, module ) VALUES ( ?, ? )' )

    for( const module of new Set( modules ) ) {
      insert.run( userId, module )
    }
  } )
}
