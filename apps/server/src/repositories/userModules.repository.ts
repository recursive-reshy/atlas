// Packages
import { z } from 'zod'
// Shared
import { ModuleId } from '@atlas/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'

// A row means "on" (the admin's modules are not stored; they are every module)
export const listModules = ( userId: string ): ModuleId[] => {
  const rows = getDatabase()
    .prepare( 'SELECT module FROM user_modules WHERE user_id = ? ORDER BY rowid' )
    .all( userId ) as { module: string }[]

  // The schema no longer lists the modules (ADR 0101), so a name the application dropped is
  // ignored rather than failing every request of that user
  return rows.flatMap( ( { module } ) => {
    const known = ModuleId.safeParse( module )

    return known.success ? [ known.data ] : []
  } )
}

// Replaces the whole set in one transaction, so a bad value leaves the old set in place
export const setModules = ( userId: string, modules: ModuleId[] ): void => {
  // The schema no longer refuses an unknown name, so it is refused here, before anything is written
  const known = z.array( ModuleId ).parse( modules )

  inTransaction( () => {
    getDatabase().prepare( 'DELETE FROM user_modules WHERE user_id = ?' ).run( userId )

    const insert = getDatabase()
      .prepare( 'INSERT INTO user_modules ( user_id, module ) VALUES ( ?, ? )' )

    for( const module of new Set( known ) ) {
      insert.run( userId, module )
    }
  } )
}
